import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for Issue 32 — Missing Partnership Check Uses Different Patterns
 *
 * Verifies the shared verifyPartnershipMembership utility:
 * 1. Returns valid when user is a member of the partnership
 * 2. Returns invalid when user is not a member
 */

describe('verifyPartnershipMembership', () => {
  it('should return valid when user is a member of the partnership', async () => {
    const { verifyPartnershipMembership } = await import('@/lib/verify-partnership');

    // Mock supabase client with membership data
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  partnership_id: 'partnership-1',
                  user_id: 'user-123',
                  role: 'owner',
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await verifyPartnershipMembership(
      mockSupabase as any,
      'user-123',
      'partnership-1'
    );

    expect(result.valid).toBe(true);
    expect(result.membership).toBeDefined();
    expect(result.membership?.partnership_id).toBe('partnership-1');
  });

  it('should return invalid when user is NOT a member of the partnership', async () => {
    const { verifyPartnershipMembership } = await import('@/lib/verify-partnership');

    // Mock supabase returning null (no membership found)
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await verifyPartnershipMembership(
      mockSupabase as any,
      'attacker-999',
      'partnership-1'
    );

    expect(result.valid).toBe(false);
    expect(result.membership).toBeUndefined();
  });

  it('should return invalid when database returns an error', async () => {
    const { verifyPartnershipMembership } = await import('@/lib/verify-partnership');

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Connection failed' },
              }),
            }),
          }),
        }),
      }),
    };

    const result = await verifyPartnershipMembership(
      mockSupabase as any,
      'user-123',
      'partnership-1'
    );

    expect(result.valid).toBe(false);
    expect(result.membership).toBeUndefined();
  });

  it('should query the partnership_members table with correct parameters', async () => {
    const { verifyPartnershipMembership } = await import('@/lib/verify-partnership');

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { partnership_id: 'p-1', user_id: 'u-1', role: 'member' },
      error: null,
    });
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = { from: mockFrom };

    await verifyPartnershipMembership(mockSupabase as any, 'u-1', 'p-1');

    expect(mockFrom).toHaveBeenCalledWith('partnership_members');
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'u-1');
    expect(mockEq2).toHaveBeenCalledWith('partnership_id', 'p-1');
  });
});
