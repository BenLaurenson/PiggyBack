import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import path from 'path';

/**
 * Tests for Issue 28 — No .old.tsx archive files in codebase
 *
 * Archive files with .old.tsx extension should be removed to keep the codebase clean.
 */

describe('codebase hygiene — Issue 28', () => {
  it('should have no .old.tsx files in the project', () => {
    const srcDir = path.resolve(__dirname, '../../..');
    // Use Node's built-in recursive readdir to find .old.tsx files
    const allFiles = readdirSync(path.join(srcDir, 'src'), { recursive: true }) as string[];
    const oldFiles = allFiles.filter(f => f.toString().endsWith('.old.tsx'));
    expect(oldFiles).toEqual([]);
  });
});
