/**
 * Unit tests for the Vercel API wrapper. Mocks fetch + resource-usage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../resource-usage", () => ({
  incrementResourceUsage: vi.fn(async () => undefined),
  getDailyUsage: vi.fn(async () => 0),
}));

import * as resourceUsage from "../resource-usage";
import {
  addProjectDomain,
  createProject,
  pollDeploymentStatus,
  setEnvVars,
  triggerDeployment,
} from "../vercel-api";

const auth = { accessToken: "test", teamId: "team-1" };

describe("vercel-api", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    delete process.env.PROVISIONER_DRY_RUN;
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createProject sends idempotency header + appends teamId param", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "p1", name: "x", accountId: "a", createdAt: 0 }),
    });
    await createProject(auth, {
      name: "x",
      gitRepo: "BenLaurenson/PiggyBack",
      idempotencyKey: "provision-x-vercel-create",
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("teamId=team-1");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-vercel-idempotency-key"]).toBe("provision-x-vercel-create");
    expect(resourceUsage.incrementResourceUsage).toHaveBeenCalledWith("vercel");
  });

  it("setEnvVars POSTs an array of env entries", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    });
    await setEnvVars(auth, "p1", [
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ key: "A", value: "1", type: "encrypted" });
  });

  it("triggerDeployment + pollDeploymentStatus reach READY", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          uid: "d1",
          url: "x.vercel.app",
          state: "QUEUED",
          createdAt: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          uid: "d1",
          url: "x.vercel.app",
          state: "READY",
          createdAt: 0,
        }),
      });

    const dep = await triggerDeployment(auth, {
      projectId: "p1",
      idempotencyKey: "provision-x-deploy",
    });
    expect(dep.uid).toBe("d1");
    const final = await pollDeploymentStatus(auth, "d1", {
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(final.state).toBe("READY");
  });

  it("addProjectDomain returns the domain shape", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ name: "abc.piggyback.finance", verified: true }),
    });
    const d = await addProjectDomain(auth, "p1", "abc.piggyback.finance");
    expect(d.name).toBe("abc.piggyback.finance");
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-vercel-idempotency-key"]).toContain("domain-p1-abc");
  });

  it("dry-run mode short-circuits all calls", async () => {
    process.env.PROVISIONER_DRY_RUN = "true";
    const proj = await createProject(auth, {
      name: "x",
      gitRepo: "BenLaurenson/PiggyBack",
    });
    expect(proj.id).toBe("dry-vercel-project");
    await setEnvVars(auth, "p1", [{ key: "K", value: "V" }]);
    const dep = await triggerDeployment(auth, { projectId: "p1" });
    expect(dep.uid).toBe("dry-deployment");
    const final = await pollDeploymentStatus(auth, "dry-deployment");
    expect(final.state).toBe("READY");
    const dom = await addProjectDomain(auth, "p1", "abc.piggyback.finance");
    expect(dom.verified).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
