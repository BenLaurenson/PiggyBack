/**
 * Goal task generation — Phase 1 #52.
 *
 * Each goal owns an AI-suggested next-step task list. Today that list is
 * generated once at goal creation and goes stale (e.g. it still says
 * "open a saver" after the user has linked one and contributed $5k). The
 * code in this module:
 *
 *   1. Builds an opaque signature of the inputs that *should* invalidate
 *      the cache (current/target amount, deadline, completion). Anything
 *      not in the signature can change without forcing a re-spend on AI
 *      credits.
 *   2. Decides whether the cached generated_tasks payload is fresh
 *      (within 24h AND signature matches) or must be regenerated.
 *   3. Provides a deterministic fallback generator that runs locally so
 *      users without an AI provider configured still see useful tasks.
 *
 * The actual AI invocation happens in src/lib/ai-tools.ts (the
 * generateGoalTasks Penny tool) and the goal-tasks server action wires
 * everything together.
 */

import { createHash } from "node:crypto";
import { calculateContributionVelocity, projectGoalEndDate } from "@/lib/goal-calculations";
import type { GoalContribution, GoalForCalculation } from "@/lib/goal-calculations";

export interface GoalTask {
  /** Stable identifier within this generation (used for done-toggling). */
  id: string;
  /** One-line action item shown to the user. */
  text: string;
  /** Priority bucket — "high" tasks render with emphasis. */
  priority: "high" | "medium" | "low";
  /** Optional secondary detail line. */
  detail?: string;
  /** Whether the user has marked this task done locally. */
  done?: boolean;
}

export interface GeneratedTasksPayload {
  tasks: GoalTask[];
  generatedAt: string; // ISO
  source: "ai" | "fallback";
  /** Hash of the inputs that produced this list. */
  inputSignature: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — brief

/**
 * Inputs that should invalidate the cache. Intentionally narrow:
 * - current/target amount and deadline drive the AI's recommendations;
 * - completion flips a binary state that obviously changes the right tasks;
 * - linked_account_id moving from null→set should also force a regen
 *   because the "open a saver" suggestion stops being relevant.
 *
 * NOT included on purpose: name, icon, color — cosmetic-only changes
 * shouldn't burn API credits.
 */
export function buildTaskInputSignature(
  goal: Pick<
    GoalForCalculation,
    "current_amount_cents" | "target_amount_cents" | "deadline" | "is_completed"
  > & { linked_account_id?: string | null }
): string {
  const payload = JSON.stringify({
    current: goal.current_amount_cents,
    target: goal.target_amount_cents,
    deadline: goal.deadline ?? null,
    completed: goal.is_completed,
    linked: goal.linked_account_id ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export interface CacheStatus {
  isFresh: boolean;
  isExpired: boolean;
  signatureChanged: boolean;
  /** Reason text suitable for telemetry / debugging. */
  reason: "no-cache" | "expired" | "signature-changed" | "fresh";
}

/**
 * Decide whether the cached generated_tasks payload still represents the
 * goal's current state. The brief asks for two triggers: state-change AND
 * 24h elapsed.
 */
export function evaluateTaskCache(
  cached: {
    tasks_generated_at: string | null;
    tasks_input_signature: string | null;
    generated_tasks: unknown;
  },
  liveSignature: string,
  now: Date = new Date()
): CacheStatus {
  if (!cached.generated_tasks || !cached.tasks_generated_at) {
    return {
      isFresh: false,
      isExpired: true,
      signatureChanged: false,
      reason: "no-cache",
    };
  }

  const generatedAt = new Date(cached.tasks_generated_at).getTime();
  const ageMs = now.getTime() - generatedAt;
  const isExpired = ageMs > CACHE_TTL_MS;
  const signatureChanged = cached.tasks_input_signature !== liveSignature;

  if (signatureChanged) {
    return {
      isFresh: false,
      isExpired,
      signatureChanged: true,
      reason: "signature-changed",
    };
  }
  if (isExpired) {
    return {
      isFresh: false,
      isExpired: true,
      signatureChanged: false,
      reason: "expired",
    };
  }
  return {
    isFresh: true,
    isExpired: false,
    signatureChanged: false,
    reason: "fresh",
  };
}

/**
 * Deterministic fallback generator. Runs locally so users without an AI
 * provider configured still see useful next-step prompts. Keep this
 * boring — the AI version layered on top is responsible for cleverness.
 */
export function generateFallbackGoalTasks(
  goal: GoalForCalculation,
  contributions: GoalContribution[],
  options: { hasLinkedSaver: boolean; now?: Date } = { hasLinkedSaver: false }
): GoalTask[] {
  const now = options.now ?? new Date();
  const remaining = Math.max(goal.target_amount_cents - goal.current_amount_cents, 0);
  const velocity = calculateContributionVelocity(contributions, 60, now);
  const projection = projectGoalEndDate(goal, contributions, { now });
  const tasks: GoalTask[] = [];

  if (goal.is_completed || remaining <= 0) {
    tasks.push({
      id: "celebrate",
      text: `Celebrate — you hit ${formatDollars(goal.target_amount_cents)}!`,
      priority: "high",
    });
    tasks.push({
      id: "withdraw-or-roll",
      text: "Decide whether to spend the goal funds or roll them into the next one",
      priority: "medium",
    });
    return tasks;
  }

  // 1. If no linked saver, pushing for one is the highest-leverage step.
  if (!options.hasLinkedSaver) {
    tasks.push({
      id: "link-saver",
      text: "Link this goal to an UP Bank Saver for automatic balance sync",
      priority: "high",
      detail: "Goals page → edit goal → choose a Saver",
    });
  }

  // 2. Velocity-based prompt.
  if (velocity.centsPerDay <= 0) {
    tasks.push({
      id: "first-contribution",
      text: "Make your first contribution to start tracking velocity",
      priority: "high",
      detail: `Even ${formatDollars(Math.max(2000, Math.round(remaining / 100)))} this week gets the projection moving`,
    });
  } else if (projection.state === "behind") {
    const need = projection.deltaDays ?? 0;
    tasks.push({
      id: "raise-rate",
      text: `Increase contribution rate — currently ${need} days behind`,
      priority: "high",
      detail: `Recent pace: ${formatDollars(velocity.centsPerFortnight)}/fortnight`,
    });
  } else if (projection.state === "on-pace") {
    tasks.push({
      id: "stay-pace",
      text: "Hold the current pace — projection is on schedule",
      priority: "low",
      detail: `Recent pace: ${formatDollars(velocity.centsPerFortnight)}/fortnight`,
    });
  } else if (projection.state === "ahead") {
    tasks.push({
      id: "consider-stretch",
      text: "Consider raising the target — current pace finishes early",
      priority: "low",
      detail: projection.deltaDays !== null
        ? `Projection beats target by ${Math.abs(projection.deltaDays)} days`
        : undefined,
    });
  }

  // 3. Deadline pressure prompt.
  if (goal.deadline) {
    const deadline = new Date(goal.deadline);
    const daysToDeadline = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysToDeadline < 0) {
      tasks.push({
        id: "rework-deadline",
        text: "Deadline has passed — set a new target date or accept the slip",
        priority: "high",
      });
    } else if (daysToDeadline <= 30 && remaining > 0) {
      tasks.push({
        id: "deadline-soon",
        text: `Final 30 days — ${formatDollars(remaining)} still to save`,
        priority: "medium",
      });
    }
  } else if (remaining > 0) {
    tasks.push({
      id: "set-deadline",
      text: "Set a target date so the projection has something to compare against",
      priority: "medium",
    });
  }

  // 4. Always cap at five — beyond that the UI feels like a chore list.
  return tasks.slice(0, 5);
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Build the GeneratedTasksPayload to persist. The caller writes both
 * `generated_tasks` and `tasks_generated_at` + `tasks_input_signature`
 * columns so we can later evaluate freshness without reading the JSON.
 */
export function packGeneratedTasks(
  tasks: GoalTask[],
  inputSignature: string,
  source: "ai" | "fallback",
  now: Date = new Date()
): GeneratedTasksPayload {
  return {
    tasks,
    generatedAt: now.toISOString(),
    source,
    inputSignature,
  };
}
