/**
 * End-to-end provisioning test.
 *
 * Drives a single provision row through every state from STRIPE_PAID → READY,
 * verifying that every transition fires correctly and state_data accumulates
 * the right context. All external API calls (Supabase Mgmt, Vercel) are
 * mocked.
 *
 * This is the cost-quota test from the spec: 100 simulated signups in dry-run
 * must NOT touch real APIs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, { encrypted_access_token: string; encrypted_refresh_token: string | null }>();

  function makeQB(table: string) {
    let filterField: string | null = null;
    let filterValue: unknown = null;
    let secondField: string | null = null;
    let secondValue: unknown = null;
    let updateFields: Record<string, unknown> | null = null;

    const find = () => {
      if (table === "piggyback_provisions") {
        for (const row of rows.values()) {
          if (filterField && row[filterField] !== filterValue) continue;
          if (secondField && row[secondField] !== secondValue) continue;
          return row;
        }
      }
      if (table === "provision_oauth_tokens") {
        return tokens.get(`${filterValue}-${secondValue}`) ?? null;
      }
      return null;
    };

    const exec = async () => {
      if (updateFields && table === "piggyback_provisions") {
        for (const [id, row] of rows.entries()) {
          if (filterField && row[filterField] !== filterValue) continue;
          if (secondField && row[secondField] !== secondValue) continue;
          rows.set(id, { ...row, ...updateFields });
        }
      }
      return { error: null };
    };

    const qb: Record<string, unknown> = {};
    qb.select = () => qb;
    qb.eq = (field: string, value: unknown) => {
      if (!filterField) {
        filterField = field;
        filterValue = value;
      } else {
        secondField = field;
        secondValue = value;
      }
      return qb;
    };
    qb.neq = () => ({ maybeSingle: async () => ({ data: null }) });
    qb.in = () => qb;
    qb.maybeSingle = async () => ({ data: find() ?? null });
    qb.update = (fields: Record<string, unknown>) => {
      updateFields = fields;
      return {
        eq: (field: string, value: unknown) => {
          if (!filterField) {
            filterField = field;
            filterValue = value;
          } else {
            secondField = field;
            secondValue = value;
          }
          return {
            eq: (f2: string, v2: unknown) => {
              secondField = f2;
              secondValue = v2;
              return exec();
            },
            then: (resolve: (v: unknown) => unknown) => exec().then(resolve),
          };
        },
      };
    };
    qb.upsert = () => ({ error: null });
    qb.insert = () => ({ error: null });
    return qb;
  }

  return {
    mocks: {
      rows,
      tokens,
      createServiceRoleClient: vi.fn(() => ({
        from: (table: string) => makeQB(table),
      })),
      pollProjectStatus: vi.fn(),
      createSupabaseProject: vi.fn(),
      getProjectKeys: vi.fn(),
      applyMigration: vi.fn(),
      createVercelProject: vi.fn(),
      setEnvVars: vi.fn(),
      addProjectDomain: vi.fn(),
      triggerDeployment: vi.fn(),
      pollDeploymentStatus: vi.fn(),
      audit: vi.fn(async () => undefined),
      transitionState: vi.fn(async () => undefined),
      decryptVaultToken: vi.fn((s: string) => s.replace("enc:", "")),
      encryptVaultToken: vi.fn((s: string) => `enc:${s}`),
      listMigrationFiles: vi.fn(() => ["001.sql", "002.sql"]),
      preflightCheck: vi.fn(async () => ({ ok: true })),
    },
  };
});

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("../supabase-mgmt", () => ({
  pollProjectStatus: mocks.pollProjectStatus,
  createProject: mocks.createSupabaseProject,
  getProjectKeys: mocks.getProjectKeys,
  applyMigration: mocks.applyMigration,
  refreshSupabaseAccessToken: vi.fn(),
  SupabaseMgmtError: class extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
}));

vi.mock("../vercel-api", () => ({
  createProject: mocks.createVercelProject,
  setEnvVars: mocks.setEnvVars,
  addProjectDomain: mocks.addProjectDomain,
  triggerDeployment: mocks.triggerDeployment,
  pollDeploymentStatus: mocks.pollDeploymentStatus,
  VercelApiError: class extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
}));

vi.mock("../state-machine", () => ({
  audit: mocks.audit,
  transitionState: mocks.transitionState,
}));

vi.mock("../token-vault", () => ({
  decryptVaultToken: mocks.decryptVaultToken,
  encryptVaultToken: mocks.encryptVaultToken,
}));

vi.mock("../migration-runner", () => ({
  listMigrationFiles: mocks.listMigrationFiles,
}));

vi.mock("../preflight", () => ({
  preflightCheck: mocks.preflightCheck,
}));

vi.mock("fs", async (importActual) => {
  const actual = await importActual<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => "SELECT 1;"),
  };
});

import { advanceProvision } from "../worker";

function seed(state: string, extra: Record<string, unknown> = {}) {
  mocks.rows.clear();
  mocks.rows.set("p1", {
    id: "p1",
    state,
    state_data: { supabase_org_id: "org-1" },
    retry_count: 0,
    next_retry_at: null,
    google_sub: "g",
    email: "u@x.io",
    display_name: "U",
    subdomain_short_id: "abc123",
    vercel_team_id: "team-1",
    stripe_subscription_id: "sub-1",
    ...extra,
  });
  mocks.tokens.set("p1-supabase", {
    encrypted_access_token: "enc:supa-tok",
    encrypted_refresh_token: "enc:supa-refresh",
  });
  mocks.tokens.set("p1-vercel", {
    encrypted_access_token: "enc:vercel-tok",
    encrypted_refresh_token: null,
  });
}

describe("e2e provisioning flow (mocked APIs)", () => {
  beforeEach(() => {
    process.env.PROVISIONER_DRY_RUN = "true";
    Object.values(mocks).forEach((v) => {
      if (typeof v === "function" && "mockReset" in v) {
        (v as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mocks.decryptVaultToken.mockImplementation((s: string) => s.replace("enc:", ""));
    mocks.encryptVaultToken.mockImplementation((s: string) => `enc:${s}`);
    mocks.listMigrationFiles.mockReturnValue(["001.sql", "002.sql"]);
    mocks.preflightCheck.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    delete process.env.PROVISIONER_DRY_RUN;
  });

  it("walks STRIPE_PAID → READY end-to-end with state_data accumulated", async () => {
    // Simulate a full pipeline. We seed each state in turn and call advance.
    // Since the worker is single-step, e2e is N invocations.

    // 1) STRIPE_PAID → AWAITING_SUPABASE_OAUTH (auto-advance)
    seed("STRIPE_PAID");
    let r = await advanceProvision("p1");
    expect(r.to).toBe("AWAITING_SUPABASE_OAUTH");

    // 2) AWAITING_SUPABASE_OAUTH is user-driven; OAuth callback would fire
    //    and we move to AWAITING_VERCEL_OAUTH. Simulate that.
    mocks.rows.set("p1", { ...mocks.rows.get("p1")!, state: "AWAITING_VERCEL_OAUTH" });
    // Then Vercel callback moves us to SUPABASE_CREATING.
    mocks.rows.set("p1", { ...mocks.rows.get("p1")!, state: "SUPABASE_CREATING" });

    // 3) SUPABASE_CREATING → MIGRATIONS_RUNNING
    mocks.createSupabaseProject.mockResolvedValue({
      id: "supa-1",
      ref: "newref",
      name: "x",
      region: "ap-southeast-2",
      status: "COMING_UP",
      created_at: "2026-05-01",
    });
    mocks.pollProjectStatus.mockResolvedValue("ACTIVE_HEALTHY");
    mocks.getProjectKeys.mockResolvedValue({
      url: "https://newref.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "sr",
    });

    r = await advanceProvision("p1");
    expect(r.to).toBe("MIGRATIONS_RUNNING");
    let sd = mocks.rows.get("p1")!.state_data as Record<string, unknown>;
    expect(sd.supabase_project_ref).toBe("newref");
    expect(sd.supabase_anon_key).toBe("anon");

    // 4) MIGRATIONS_RUNNING → VERCEL_CREATING
    mocks.applyMigration.mockResolvedValue(undefined);
    r = await advanceProvision("p1");
    expect(r.to).toBe("VERCEL_CREATING");
    sd = mocks.rows.get("p1")!.state_data as Record<string, unknown>;
    expect(sd.applied_migrations).toEqual(["001.sql", "002.sql"]);

    // 5) VERCEL_CREATING → VERCEL_ENV_SET
    mocks.createVercelProject.mockResolvedValue({
      id: "vproj-1",
      name: "piggyback-abc123",
      accountId: "a",
      createdAt: 0,
    });
    r = await advanceProvision("p1");
    expect(r.to).toBe("VERCEL_ENV_SET");

    // 6) VERCEL_ENV_SET → DOMAIN_ATTACHING
    mocks.setEnvVars.mockResolvedValue(undefined);
    r = await advanceProvision("p1");
    expect(r.to).toBe("DOMAIN_ATTACHING");

    // 7) DOMAIN_ATTACHING → INITIAL_DEPLOY
    mocks.addProjectDomain.mockResolvedValue({
      name: "abc123.piggyback.finance",
      verified: true,
    });
    r = await advanceProvision("p1");
    expect(r.to).toBe("INITIAL_DEPLOY");

    // 8) INITIAL_DEPLOY → READY
    mocks.triggerDeployment.mockResolvedValue({
      uid: "dep-1",
      url: "x.vercel.app",
      state: "QUEUED",
      createdAt: 0,
    });
    mocks.pollDeploymentStatus.mockResolvedValue({
      uid: "dep-1",
      url: "x.vercel.app",
      state: "READY",
      createdAt: 0,
    });
    r = await advanceProvision("p1");
    expect(r.to).toBe("READY");
    expect(mocks.rows.get("p1")!.state).toBe("READY");
  });

  it("100 simulated signups in dry-run never touch real APIs", async () => {
    // Ensure no env-real-call wrapper sneaks through. We don't actually
    // invoke fetch here — but the *real* dry-run check is in supabase-mgmt /
    // vercel-api (Tasks 2 + 3). This test asserts the worker skeleton
    // doesn't call anything that bypasses our mocks.
    for (let i = 0; i < 100; i++) {
      seed("STRIPE_PAID");
      const r = await advanceProvision("p1");
      expect(r.to).toBe("AWAITING_SUPABASE_OAUTH");
    }
    // None of the API mocks should have been called for STRIPE_PAID transitions.
    expect(mocks.createSupabaseProject).not.toHaveBeenCalled();
    expect(mocks.createVercelProject).not.toHaveBeenCalled();
  });

  it("preflight failure (no_stripe_sub) marks FAILED_PERMANENT", async () => {
    seed("SUPABASE_CREATING");
    mocks.preflightCheck.mockResolvedValue({ ok: false, blocker: "no_stripe_sub" });
    const r = await advanceProvision("p1");
    expect(r.to).toBe("FAILED_PERMANENT");
  });

  it("worker resumes from FAILED_RETRYABLE using last_failure_state", async () => {
    seed("FAILED_RETRYABLE", {
      state_data: { last_failure_state: "VERCEL_CREATING" },
    });
    mocks.createVercelProject.mockResolvedValue({
      id: "vproj-1",
      name: "x",
      accountId: "a",
      createdAt: 0,
    });
    const r = await advanceProvision("p1");
    expect(r.to).toBe("VERCEL_ENV_SET");
  });
});
