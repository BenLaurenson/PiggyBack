import { test } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { slugify } from "../slugify";

describe("slugify property-based tests", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 200 })])(
    "never returns empty string for non-whitespace input containing alphanumeric chars",
    (input) => {
      if (/[a-zA-Z0-9]/.test(input)) {
        expect(slugify(input).length).toBeGreaterThan(0);
      }
    }
  );

  test.prop([fc.string({ minLength: 0, maxLength: 500 })])(
    "output only contains lowercase alphanumeric chars and hyphens",
    (input) => {
      const result = slugify(input);
      expect(result).toMatch(/^[a-z0-9-]*$/);
    }
  );

  test.prop([fc.string({ minLength: 0, maxLength: 500 })])(
    "output never exceeds 80 characters",
    (input) => {
      expect(slugify(input).length).toBeLessThanOrEqual(80);
    }
  );

  test.prop([fc.string({ minLength: 0, maxLength: 500 })])(
    "output never starts or ends with a hyphen",
    (input) => {
      const result = slugify(input);
      if (result.length > 0 && result !== "budget") {
        expect(result).not.toMatch(/^-/);
        expect(result).not.toMatch(/-$/);
      }
    }
  );

  test.prop([fc.string({ minLength: 0, maxLength: 500 })])(
    "output never contains consecutive hyphens",
    (input) => {
      expect(slugify(input)).not.toMatch(/--/);
    }
  );

  test.prop([fc.string({ minLength: 0, maxLength: 200 })])(
    "slugify is idempotent",
    (input) => {
      const once = slugify(input);
      const twice = slugify(once);
      expect(twice).toBe(once);
    }
  );
});
