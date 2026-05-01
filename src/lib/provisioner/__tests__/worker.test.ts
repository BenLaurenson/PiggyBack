/**
 * Tests for the provisioning worker.
 *
 * We mock the service-role Supabase client + every Mgmt API wrapper, and use
 * an in-memory fake row store so transitionWithCAS exercises real logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, { encrypted_access_token: string; encrypted_refresh_token: string | null }>();

  function getRow(id: string) {
    return rows.get(id);
  }

  function makeQB(table: string) {
    let filterField: string | null = null;
    let filterValue: unknown = null;
    let secondField: string | null = null;
    let secondValue: unknown = null;
    let updateFields: Record<string, unknown> | null = null;
    let insertValues: Record<string, unknown> | null = null;

    const find = () => {
      if (table === "piggyback_provisions") {
        for (const row of rows.values()) {
          if (filterField && row[filterField] !== filterValue) continue;
          if (secondField && row[secondField] !== secondValue) continue;
          return row;
        }
      }
      if (table === "provision_oauth_tokens") {
        const key = `${filterValue}-${secondValue}`;
        return tokens.get(key) ?? null;
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
        return { error: null };
      }
      if (insertValues && table === "piggyback_provisions") {
        const id = (insertValues.id as string) ?? `row-${rows.size}`;
        rows.set(id, { id, ...insertValues });
        return { error: null };
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
    qb.in = () => qb;
    qb.or = () => qb;
    qb.limit = () => qb;
    qb.maybeSingle = async () => ({ data: find() ?? null });
    qb.single = async () => ({ data: find() ?? null });
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
    qb.insert = (values: Record<string, unknown>) => {
      insertValues = values;
      return { error: null, then: (resolve: (v: unknown) => unknown) => exec().then(resolve) };
    };
    qb.upsert = () => ({ error: null });
    return qb;
  }

  const supabaseMock = {
    from: (table: string) => makeQB(table),
  };

  return {
    mocks: {
      rows,
      tokens,
      getRow,
      createServiceRoleClient: vi.fn(() => supabaseMock),
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
      listMigrationFiles: vi.fn(() => ["001.sql"]),
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
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
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
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
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
  preflightCheck: vi.fn(async () => ({ ok: true })),
}));

// Avoid actually reading .sql files.
vi.mock("fs", async (importActual) => {
  const actual = await importActual<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => "SELECT 1;"),
  };
});

import { advanceProvision } from "../worker";

function seedRow(row: Partial<Record<string, unknown>> & { id: string; state: string }) {
  mocks.rows.set(row.id, {
    id: row.id,
    state: row.state,
    state_data: {},
    retry_count: 0,
    next_retry_at: null,
    google_sub: "g-sub",
    email: "u@example.com",
    display_name: "U",
    subdomain_short_id: "abc123",
    vercel_team_id: "team-1",
    stripe_subscription_id: "sub-1",
    ...row,
  });
}

function seedToken(provisionId: string, provider: "supabase" | "vercel") {
  mocks.tokens.set(`${provisionId}-${provider}`, {
    encrypted_access_token: `enc:tok-${provider}`,
    encrypted_refresh_token: `enc:refresh-${provider}`,
  });
}

describe("worker.advanceProvision", () => {
  beforeEach(() => {
    mocks.rows.clear();
    mocks.tokens.clear();
    Object.values(mocks).forEach((v) => {
      if (typeof v === "function" && "mockReset" in v) {
        (v as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mocks.decryptVaultToken.mockImplementation((s: string) => s.replace("enc:", ""));
    mocks.encryptVaultToken.mockImplementation((s: string) => `enc:${s}`);
    mocks.listMigrationFiles.mockReturnValue(["001.sql"]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("STRIPE_PAID auto-advances to AWAITING_SUPABASE_OAUTH", async () => {
    seedRow({ id: "p1", state: "STRIPE_PAID" });
    const result = await advanceProvision("p1");
    expect(result.from).toBe("STRIPE_PAID");
    expect(result.to).toBe("AWAITING_SUPABASE_OAUTH");
    expect(mocks.rows.get("p1")?.state).toBe("AWAITING_SUPABASE_OAUTH");
  });

  it("SUPABASE_CREATING → MIGRATIONS_RUNNING when project becomes ACTIVE_HEALTHY", async () => {
    seedRow({
      id: "p1",
      state: "SUPABASE_CREATING",
      state_data: { supabase_org_id: "org-1" },
    });
    seedToken("p1", "supabase");

    mocks.createSupabaseProject.mockResolvedValue({
      id: "supa-1",
      ref: "newref123",
      name: "x",
      region: "ap-southeast-2",
      status: "COMING_UP",
      created_at: "2026-05-01",
    });
    mocks.pollProjectStatus.mockResolvedValue("ACTIVE_HEALTHY");
    mocks.getProjectKeys.mockResolvedValue({
      url: "https://newref123.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "sr",
    });

    const result = await advanceProvision("p1");
    expect(result.to).toBe("MIGRATIONS_RUNNING");
    expect(mocks.rows.get("p1")?.state).toBe("MIGRATIONS_RUNNING");
    const sd = mocks.rows.get("p1")?.state_data as Record<string, unknown>;
    expect(sd.supabase_project_ref).toBe("newref123");
    expect(sd.supabase_anon_key).toBe("anon");
    expect(sd.supabase_url).toBe("https://newref123.supabase.co");
  });

  it("SUPABASE_CREATING with no token marks FAILED_PERMANENT", async () => {
    seedRow({
      id: "p1",
      state: "SUPABASE_CREATING",
      state_data: { supabase_org_id: "org-1" },
    });
    // no seedToken — missing
    const result = await advanceProvision("p1");
    expect(result.to).toBe("FAILED_PERMANENT");
    expect(mocks.rows.get("p1")?.state).toBe("FAILED_PERMANENT");
  });

  it("MIGRATIONS_RUNNING applies migrations + advances to VERCEL_CREATING", async () => {
    seedRow({
      id: "p1",
      state: "MIGRATIONS_RUNNING",
      state_data: { supabase_project_ref: "newref123" },
    });
    seedToken("p1", "supabase");
    mocks.applyMigration.mockResolvedValue(undefined);

    const result = await advanceProvision("p1");
    expect(result.to).toBe("VERCEL_CREATING");
    expect(mocks.applyMigration).toHaveBeenCalledTimes(1);
    expect(mocks.rows.get("p1")?.state).toBe("VERCEL_CREATING");
  });

  it("VERCEL_CREATING creates project + advances to VERCEL_ENV_SET", async () => {
    seedRow({ id: "p1", state: "VERCEL_CREATING", state_data: {} });
    seedToken("p1", "vercel");
    mocks.createVercelProject.mockResolvedValue({
      id: "vproj-1",
      name: "piggyback-abc123",
      accountId: "a",
      createdAt: 0,
    });

    const result = await advanceProvision("p1");
    expect(result.to).toBe("VERCEL_ENV_SET");
    expect(mocks.rows.get("p1")?.state).toBe("VERCEL_ENV_SET");
    expect((mocks.rows.get("p1")?.state_data as Record<string, unknown>).vercel_project_id).toBe(
      "vproj-1"
    );
  });

  it("VERCEL_ENV_SET sets env + advances to DOMAIN_ATTACHING", async () => {
    seedRow({
      id: "p1",
      state: "VERCEL_ENV_SET",
      state_data: {
        vercel_project_id: "vproj-1",
        supabase_url: "u",
        supabase_anon_key: "a",
        supabase_service_role_key: "sr",
      },
    });
    seedToken("p1", "vercel");
    mocks.setEnvVars.mockResolvedValue(undefined);

    const result = await advanceProvision("p1");
    expect(result.to).toBe("DOMAIN_ATTACHING");
    expect(mocks.setEnvVars).toHaveBeenCalled();
    const callArgs = mocks.setEnvVars.mock.calls[0];
    const vars = callArgs[2] as Array<{ key: string; value: string }>;
    const keys = vars.map((v) => v.key);
    expect(keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(keys).toContain("UP_API_ENCRYPTION_KEY");
    expect(keys).toContain("CRON_SECRET");
    // Tenant must NOT be marked as orchestrator.
    const hostedFlag = vars.find((v) => v.key === "NEXT_PUBLIC_HOSTED_ENABLED");
    expect(hostedFlag?.value).toBe("");
  });

  it("DOMAIN_ATTACHING attaches domain + advances to INITIAL_DEPLOY", async () => {
    seedRow({
      id: "p1",
      state: "DOMAIN_ATTACHING",
      subdomain_short_id: "abc123",
      state_data: { vercel_project_id: "vproj-1" },
    });
    seedToken("p1", "vercel");
    mocks.addProjectDomain.mockResolvedValue({ name: "abc123.piggyback.finance", verified: true });

    const result = await advanceProvision("p1");
    expect(result.to).toBe("INITIAL_DEPLOY");
    expect(mocks.addProjectDomain).toHaveBeenCalledWith(
      expect.anything(),
      "vproj-1",
      "abc123.piggyback.finance"
    );
  });

  it("INITIAL_DEPLOY triggers + waits READY → READY", async () => {
    seedRow({
      id: "p1",
      state: "INITIAL_DEPLOY",
      state_data: { vercel_project_id: "vproj-1" },
    });
    seedToken("p1", "vercel");
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

    const result = await advanceProvision("p1");
    expect(result.to).toBe("READY");
    expect(mocks.rows.get("p1")?.state).toBe("READY");
  });

  it("INITIAL_DEPLOY with deployment ERROR marks FAILED_RETRYABLE", async () => {
    seedRow({
      id: "p1",
      state: "INITIAL_DEPLOY",
      state_data: { vercel_project_id: "vproj-1", deployment_id: "dep-1" },
    });
    seedToken("p1", "vercel");
    mocks.pollDeploymentStatus.mockResolvedValue({
      uid: "dep-1",
      url: "",
      state: "ERROR",
      createdAt: 0,
    });

    const result = await advanceProvision("p1");
    expect(result.to).toBe("FAILED_RETRYABLE");
    expect(mocks.rows.get("p1")?.state).toBe("FAILED_RETRYABLE");
  });

  it("Terminal state (READY) is a no-op", async () => {
    seedRow({ id: "p1", state: "READY" });
    const result = await advanceProvision("p1");
    expect(result.from).toBe("READY");
    expect(result.to).toBe("READY");
  });

  it("AWAITING_SUPABASE_OAUTH is user-driven, no-op", async () => {
    seedRow({ id: "p1", state: "AWAITING_SUPABASE_OAUTH" });
    const result = await advanceProvision("p1");
    expect(result.to).toBe("AWAITING_SUPABASE_OAUTH");
  });
});
