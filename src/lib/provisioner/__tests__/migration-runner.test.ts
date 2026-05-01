/**
 * Tests for the migration runner. Mocks the supabase-mgmt module so we don't
 * hit the network, and uses a temp directory of fixture .sql files.
 */
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { applyMigrationMock } = vi.hoisted(() => ({
  applyMigrationMock: vi.fn(),
}));

vi.mock("../supabase-mgmt", () => ({
  applyMigration: applyMigrationMock,
}));

import { listMigrationFiles, runAllMigrations } from "../migration-runner";

const auth = { accessToken: "test-token" };

describe("migration-runner", () => {
  let dir: string;

  beforeEach(() => {
    applyMigrationMock.mockReset();
    dir = mkdtempSync(join(tmpdir(), "piggyback-migrations-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("listMigrationFiles returns .sql files sorted lexicographically", () => {
    writeFileSync(join(dir, "002_b.sql"), "-- b");
    writeFileSync(join(dir, "001_a.sql"), "-- a");
    writeFileSync(join(dir, "README.md"), "# notes");
    expect(listMigrationFiles(dir)).toEqual(["001_a.sql", "002_b.sql"]);
  });

  it("runAllMigrations applies every file in order", async () => {
    writeFileSync(join(dir, "001_a.sql"), "CREATE TABLE a();");
    writeFileSync(join(dir, "002_b.sql"), "CREATE TABLE b();");
    applyMigrationMock.mockResolvedValue(undefined);

    const result = await runAllMigrations(auth, "ref-1", { dir });
    expect(result.applied).toEqual(["001_a.sql", "002_b.sql"]);
    expect(result.failed).toEqual([]);
    expect(applyMigrationMock).toHaveBeenCalledTimes(2);
    expect(applyMigrationMock).toHaveBeenNthCalledWith(
      1,
      auth,
      "ref-1",
      "CREATE TABLE a();",
      "001_a.sql"
    );
  });

  it("stops on first failure", async () => {
    writeFileSync(join(dir, "001_a.sql"), "ok");
    writeFileSync(join(dir, "002_b.sql"), "broken");
    writeFileSync(join(dir, "003_c.sql"), "skipped");

    applyMigrationMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("syntax error at 002"))
      .mockResolvedValueOnce(undefined);

    const result = await runAllMigrations(auth, "ref-1", { dir });
    expect(result.applied).toEqual(["001_a.sql"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ name: "002_b.sql" });
    // 003 should never have been attempted.
    expect(applyMigrationMock).toHaveBeenCalledTimes(2);
  });

  it("skips already-applied migrations", async () => {
    writeFileSync(join(dir, "001_a.sql"), "ok");
    writeFileSync(join(dir, "002_b.sql"), "ok");
    applyMigrationMock.mockResolvedValue(undefined);

    const result = await runAllMigrations(auth, "ref-1", {
      dir,
      alreadyApplied: ["001_a.sql"],
    });
    expect(result.applied).toEqual(["002_b.sql"]);
    expect(applyMigrationMock).toHaveBeenCalledTimes(1);
  });
});
