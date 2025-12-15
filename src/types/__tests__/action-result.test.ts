/**
 * Tests for unified ActionResult type
 * Verifies the type is importable, works correctly with generics, and
 * that helper functions produce the correct shapes.
 */
import { describe, it, expect } from 'vitest';

describe('ActionResult type and helpers', () => {
  it('should be importable from @/types/action-result', async () => {
    const mod = await import('@/types/action-result');
    expect(mod.ok).toBeDefined();
    expect(mod.fail).toBeDefined();
    expect(typeof mod.ok).toBe('function');
    expect(typeof mod.fail).toBe('function');
  });

  it('ok() should return success: true with data', async () => {
    const { ok } = await import('@/types/action-result');
    const result = ok({ id: '123', name: 'Test' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '123', name: 'Test' });
    expect(result.error).toBeUndefined();
  });

  it('ok() without data should return success: true with undefined data', async () => {
    const { ok } = await import('@/types/action-result');
    const result = ok();

    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('fail() should return success: false with error message', async () => {
    const { fail } = await import('@/types/action-result');
    const result = fail('Something went wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
    expect(result.data).toBeUndefined();
  });

  it('result shapes should be consistent between ok and fail', async () => {
    const { ok, fail } = await import('@/types/action-result');
    const success = ok({ count: 5 });
    const failure = fail('Error');

    // Both have the same shape: { success, data?, error? }
    expect('success' in success).toBe(true);
    expect('success' in failure).toBe(true);

    // Type discrimination works via success field
    if (success.success) {
      expect(success.data).toEqual({ count: 5 });
    }
    if (!failure.success) {
      expect(failure.error).toBe('Error');
    }
  });
});
