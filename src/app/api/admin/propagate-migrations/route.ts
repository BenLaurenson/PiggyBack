/**
 * Walk every READY hosted provision and apply any pending migrations from
 * the bundled supabase/migrations/*.sql to their per-tenant Supabase via the
 * stored OAuth access token.
 *
 * Tracking happens in `_piggyback_migrations` inside each tenant DB so this
 * endpoint is idempotent — re-running just no-ops on already-applied
 * migration files.
 *
 * Modes:
 *   POST /api/admin/propagate-migrations
 *     body: { provisionId: "uuid" }
 *     Targets a single provision. Used from the admin UI's "Run migrations"
 *     button.
 *
 *   GET /api/admin/propagate-migrations?all=true
 *     auth: Authorization: Bearer <CRON_SECRET>
 *     Walks every READY provision. Used by the Vercel cron.
 *
 * Per-tenant errors are queued via the audit log; one user's failed
 * migration never blocks the rest.
 */

import { NextResponse, type NextRequest } from "next/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit, getProvisionById, readOAuthToken } from "@/lib/provisioner/state-machine";
import { runSql } from "@/lib/provisioner/supabase-mgmt";

export const runtime = "nodejs";
export const maxDuration = 300;

interface MigrateResult {
  provisionId: string;
  applied: string[];
  skipped: string[];
  error?: string;
}

async function migrateOne(provisionId: string): Promise<MigrateResult> {
  const result: MigrateResult = { provisionId, applied: [], skipped: [] };
  try {
    const provision = await getProvisionById(provisionId);
    if (!provision?.supabase_project_ref) {
      throw new Error("Supabase project ref missing");
    }
    const token = await readOAuthToken(provisionId, "supabase");
    if (!token) throw new Error("No Supabase OAuth token for provision");

    const auth = { accessToken: token.accessToken };
    const ref = provision.supabase_project_ref;

    // Tracking table (idempotent)
    await runSql(auth, ref, `
      CREATE TABLE IF NOT EXISTS public._piggyback_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // What's already applied?
    const appliedRows = (await runSql(
      auth,
      ref,
      "SELECT filename FROM public._piggyback_migrations"
    )) as Array<{ filename: string }>;
    const alreadyApplied = new Set(appliedRows.map((r) => r.filename));

    // Walk migration files lexicographically
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await runSql(auth, ref, sql);
      const safe = file.replace(/'/g, "''");
      await runSql(
        auth,
        ref,
        `INSERT INTO public._piggyback_migrations (filename) VALUES ('${safe}')`
      );
      result.applied.push(file);
      await audit(provisionId, "MIGRATION_APPLIED", { filename: file });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    await audit(provisionId, "MIGRATION_PROPAGATION_FAILED", { message });
  }
  return result;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { provisionId?: string };
  if (!body.provisionId) {
    return NextResponse.json({ error: "provisionId required" }, { status: 400 });
  }
  const result = await migrateOne(body.provisionId);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("all") !== "true") {
    return NextResponse.json({ error: "use ?all=true" }, { status: 400 });
  }
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: provisions } = await supabase
    .from("piggyback_provisions")
    .select("id")
    .eq("state", "READY")
    .limit(500);

  const results: MigrateResult[] = [];
  for (const p of provisions ?? []) {
    results.push(await migrateOne(p.id));
  }

  const totalApplied = results.reduce((acc, r) => acc + r.applied.length, 0);
  const errors = results.filter((r) => !!r.error).length;

  return NextResponse.json({
    checked: results.length,
    totalApplied,
    errors,
    results,
  });
}
