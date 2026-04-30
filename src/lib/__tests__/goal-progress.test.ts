import { describe, it, expect } from "vitest";
import { goalProgressPercent, goalRemainingCents } from "@/lib/goal-progress";

describe("goalProgressPercent", () => {
  it("returns current/target when start is 0 (legacy rows)", () => {
    expect(goalProgressPercent({
      current_amount_cents: 5000,
      target_amount_cents: 10000,
      start_amount_cents: 0,
    })).toBe(50);
  });

  it("uses (current - start) / (target - start) when start is positive", () => {
    // Linked-Saver scenario: goal target 10k, Saver had 5k at link time,
    // current 7.5k → user has saved 2.5k of the 5k delta = 50%.
    expect(goalProgressPercent({
      current_amount_cents: 7500,
      target_amount_cents: 10000,
      start_amount_cents: 5000,
    })).toBe(50);
  });

  it("caps at 100", () => {
    expect(goalProgressPercent({
      current_amount_cents: 20000,
      target_amount_cents: 10000,
      start_amount_cents: 0,
    })).toBe(100);
  });

  it("floors at 0 when current is below start", () => {
    expect(goalProgressPercent({
      current_amount_cents: 4000,
      target_amount_cents: 10000,
      start_amount_cents: 5000,
    })).toBe(0);
  });

  it("returns 100 when target <= start (already met)", () => {
    expect(goalProgressPercent({
      current_amount_cents: 5000,
      target_amount_cents: 5000,
      start_amount_cents: 5000,
    })).toBe(100);
  });

  it("treats undefined start as 0", () => {
    expect(goalProgressPercent({
      current_amount_cents: 2500,
      target_amount_cents: 10000,
    })).toBe(25);
  });
});

describe("goalRemainingCents", () => {
  it("returns target minus current", () => {
    expect(goalRemainingCents({
      current_amount_cents: 3000,
      target_amount_cents: 10000,
    })).toBe(7000);
  });

  it("never goes negative", () => {
    expect(goalRemainingCents({
      current_amount_cents: 12000,
      target_amount_cents: 10000,
    })).toBe(0);
  });
});
