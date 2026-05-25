import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWiseTransaction, type ProcessInput } from '@/lib/business-ingest';
import type { CategorisationRule } from '@/lib/business-categorise';
import { __clearFxCache } from '@/lib/wise-fx';

interface UpsertCall {
  table: string;
  row: Record<string, unknown>;
  onConflict?: string;
}

function makeSupabaseStub() {
  const upsertCalls: UpsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (row: Record<string, unknown>, options?: { onConflict?: string }) => {
          upsertCalls.push({ table, row, onConflict: options?.onConflict });
          return { data: { ...row, id: 'inserted-id' }, error: null };
        },
      };
    },
  };
  return { client, upsertCalls };
}

const baseInput = (over: Partial<ProcessInput> = {}): ProcessInput => ({
  userId: 'user-1',
  businessAccountId: 'acct-1',
  source: 'wise_api',
  reportingTimezone: 'Australia/Sydney',
  rules: [],
  entry: {
    reference_number: 'REF-001',
    occurred_at: new Date('2026-05-23T03:00:00Z'), // 13:00 Sydney
    description: 'AWS Sydney',
    amount_cents: -11_000, // -$110 debit
    currency_code: 'AUD',
    wise_category: null,
    exchange_rate_from_wise: null,
    raw_payload: { hi: 'world' },
  },
  ...over,
});

beforeEach(() => __clearFxCache());

describe('processWiseTransaction', () => {
  it('composes wise_transaction_id as ${reference_number}|${direction} and populates reference_number column', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(client as never, baseInput());
    expect(upsertCalls).toHaveLength(1);
    const row = upsertCalls[0].row;
    expect(row.reference_number).toBe('REF-001');
    expect(row.wise_transaction_id).toBe('REF-001|debit');
    expect(row.direction).toBe('debit');
    expect(upsertCalls[0].onConflict).toBe('user_id,wise_transaction_id');
  });

  it('upserts an AUD transaction with fx_status=resolved', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(client as never, baseInput());
    expect(upsertCalls[0].row).toMatchObject({
      user_id: 'user-1',
      business_account_id: 'acct-1',
      amount_cents: -11_000,
      currency_code: 'AUD',
      amount_aud_cents: -11_000,
      fx_status: 'resolved',
      source: 'wise_api',
      coa_id: null,
      gst_code: null,
      gst_amount_aud_cents: null,
    });
    expect(upsertCalls[0].row.reporting_date).toBe('2026-05-23');
  });

  it('applies a matching rule and sets coa_id + gst_code + gst_amount from pre-resolved default', async () => {
    const rule: CategorisationRule = {
      id: 'r1',
      match_field: 'description',
      match_type: 'contains',
      match_value: 'aws',
      coa_id: 'coa-software',
      coa_default_gst_code: 'G11',
      gst_code_override: null,
      priority: 100,
      is_active: true,
    };
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(client as never, baseInput({ rules: [rule] }));
    expect(upsertCalls[0].row).toMatchObject({
      coa_id: 'coa-software',
      gst_code: 'G11',
      gst_amount_aud_cents: -1_000,
    });
  });

  it('uses gst_code_override when set on the rule', async () => {
    const rule: CategorisationRule = {
      id: 'r1',
      match_field: 'description',
      match_type: 'contains',
      match_value: 'aws',
      coa_id: 'coa-software',
      coa_default_gst_code: 'G11',
      gst_code_override: 'N-T',
      priority: 100,
      is_active: true,
    };
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(client as never, baseInput({ rules: [rule] }));
    expect(upsertCalls[0].row).toMatchObject({
      coa_id: 'coa-software',
      gst_code: 'N-T',
      gst_amount_aud_cents: 0,
    });
  });

  it('derives reporting_date in the configured timezone (UTC->next-day in Sydney)', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          occurred_at: new Date('2026-05-23T15:00:00Z'), // 01:00 Sydney next day
        },
      }),
    );
    expect(upsertCalls[0].row.reporting_date).toBe('2026-05-24');
  });

  it('uses Wise-supplied rate when present', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: 1.5,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: -15_000,
      exchange_rate: 1.5,
      exchange_rate_source: 'wise',
      fx_status: 'resolved',
    });
  });

  it('falls back to Frankfurter when Wise has no rate and currency is non-AUD', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-05-23', rates: { AUD: 1.5 } }),
    }));
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: null,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: -15_000,
      exchange_rate: 1.5,
      exchange_rate_source: 'spot_feed',
      fx_status: 'resolved',
    });
    vi.unstubAllGlobals();
  });

  it('marks fx_status=missing when Frankfurter fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'down' }));
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: null,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: null,
      exchange_rate: null,
      exchange_rate_source: null,
      fx_status: 'missing',
    });
    vi.unstubAllGlobals();
  });

  it('CSV import source: reference_number is null, wise_transaction_id is null, fingerprint drives conflict', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        source: 'csv_import',
        entry: {
          ...baseInput().entry,
          reference_number: null,
          import_fingerprint: 'fp-abc',
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      import_fingerprint: 'fp-abc',
      reference_number: null,
      wise_transaction_id: null,
      source: 'csv_import',
    });
    expect(upsertCalls[0].onConflict).toBe('user_id,import_fingerprint');
  });
});
