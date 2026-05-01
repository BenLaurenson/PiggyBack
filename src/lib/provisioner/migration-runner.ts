/**
 * Migration runner for newly-provisioned tenant Supabase projects.
 *
 * Reads every `*.sql` file from `supabase/migrations/` in lexicographic order
 * and applies it to the target project via the Mgmt API. Stop-on-first-failure
 * because subsequent migrations almost always depend on prior ones.
 *
 * Note: this runs ALL the migrations in the repo (including orchestrator-only
 * migrations like `20260501000001_orchestrator_partner_links.sql`). The
 * orchestrator tables are duplicated harmlessly into each tenant DB —
 * they're queried only on the orchestrator side via service-role. A future
 * pass could split orchestrator-only vs tenant-only migrations into
 * sub-folders, but for MVP applying all of them keeps things simple.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { applyMigration, type SupabaseMgmtAuth } from "./supabase-mgmt";

export interface MigrationRunResult {
  applied: string[];
  failed: { name: string; error: string }[];
}

export function listMigrationFiles(dir?: string): string[] {
  const root = dir ?? join(process.cwd(), "supabase/migrations");
  return readdirSync(root)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function runAllMigrations(
  auth: SupabaseMgmtAuth,
  projectRef: string,
  options: { dir?: string; alreadyApplied?: string[] } = {}
): Promise<MigrationRunResult> {
  const dir = options.dir ?? join(process.cwd(), "supabase/migrations");
  const files = listMigrationFiles(dir);
  const skip = new Set(options.alreadyApplied ?? []);
  const applied: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const file of files) {
    if (skip.has(file)) {
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf-8");
    try {
      await applyMigration(auth, projectRef, sql, file);
      applied.push(file);
    } catch (err) {
      failed.push({ name: file, error: String(err) });
      // Stop on first failure — subsequent migrations may depend on this one.
      break;
    }
  }
  return { applied, failed };
}
