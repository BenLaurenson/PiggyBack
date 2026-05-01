import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isOrchestrator,
  isTenant,
  assertOrchestrator,
  assertTenant,
} from "@/lib/role-context";

describe("role-context", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("isOrchestrator true when NEXT_PUBLIC_HOSTED_ENABLED=true", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
    expect(isOrchestrator()).toBe(true);
    expect(isTenant()).toBe(false);
  });

  it("isTenant true when NEXT_PUBLIC_HOSTED_ENABLED unset", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "");
    expect(isOrchestrator()).toBe(false);
    expect(isTenant()).toBe(true);
  });

  it("assertOrchestrator throws on tenant", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "");
    expect(() => assertOrchestrator()).toThrow(/orchestrator-only/i);
  });

  it("assertTenant throws on orchestrator", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
    expect(() => assertTenant()).toThrow(/tenant-only/i);
  });
});
