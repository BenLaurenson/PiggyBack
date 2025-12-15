import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDisplayName, formatLastSynced } from '../user-display';

describe('getDisplayName', () => {
  describe('priority 1: profile display name', () => {
    it('returns profile name when set', () => {
      expect(getDisplayName('Jane', 'Jane Doe', 'jane@example.com')).toBe('Jane');
    });

    it('trims whitespace from profile name', () => {
      expect(getDisplayName('  Jane  ', null, null)).toBe('Jane');
    });

    it('skips empty/whitespace-only profile name', () => {
      expect(getDisplayName('   ', 'Jane Doe', null)).toBe('Jane');
    });
  });

  describe('priority 2: auth full_name', () => {
    it('returns first name from full name', () => {
      expect(getDisplayName(null, 'Jane Doe', 'jane@example.com')).toBe('Jane');
    });

    it('returns single name as-is', () => {
      expect(getDisplayName(null, 'Jane', null)).toBe('Jane');
    });

    it('trims whitespace from full name', () => {
      expect(getDisplayName(null, '  Jane Doe  ', null)).toBe('Jane');
    });

    it('skips empty/whitespace-only full name', () => {
      expect(getDisplayName(null, '  ', 'jane@example.com')).toBe('Jane');
    });
  });

  describe('priority 3: email inference', () => {
    it('extracts first name from dot-separated email', () => {
      expect(getDisplayName(null, null, 'jane.doe@example.com')).toBe('Jane');
    });

    it('extracts first name from underscore-separated email', () => {
      expect(getDisplayName(null, null, 'jane_doe@example.com')).toBe('Jane');
    });

    it('extracts first name from dash-separated email', () => {
      expect(getDisplayName(null, null, 'jane-doe@example.com')).toBe('Jane');
    });

    it('extracts first name from camelCase email', () => {
      expect(getDisplayName(null, null, 'janeDoe@example.com')).toBe('Jane');
    });

    it('capitalizes unseparable prefix as fallback', () => {
      expect(getDisplayName(null, null, 'janedoe@example.com')).toBe('Janedoe');
    });

    it('handles single-char prefix before separator', () => {
      // "j.doe" - first part "j" is < 2 chars, falls through to camelCase, then capitalize
      expect(getDisplayName(null, null, 'j.doe@example.com')).toBe('J.doe');
    });

    it('handles uppercase email prefix', () => {
      expect(getDisplayName(null, null, 'JANE@example.com')).toBe('JANE');
    });
  });

  describe('priority 4: fallback', () => {
    it('returns "there" when all sources are null', () => {
      expect(getDisplayName(null, null, null)).toBe('there');
    });

    it('returns "there" when all sources are undefined', () => {
      expect(getDisplayName(undefined, undefined, undefined)).toBe('there');
    });

    it('returns "there" when all sources are empty strings', () => {
      expect(getDisplayName('', '', '')).toBe('there');
    });
  });
});

describe('formatLastSynced', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null', () => {
    expect(formatLastSynced(null)).toBe('Never');
  });

  it('returns "Just now" for less than 1 minute ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-06T12:00:30Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('Just now');
  });

  it('returns minutes ago for recent syncs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-06T12:05:00Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('5 min ago');
  });

  it('returns singular hour for 1 hour ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-06T13:00:00Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('1 hour ago');
  });

  it('returns plural hours for multiple hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-06T15:00:00Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('3 hours ago');
  });

  it('returns singular day for 1 day ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T12:00:00Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('1 day ago');
  });

  it('returns plural days for multiple days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T12:00:00Z'));
    expect(formatLastSynced('2026-02-06T12:00:00Z')).toBe('3 days ago');
  });

  it('returns formatted date for 7+ days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T12:00:00Z'));
    const result = formatLastSynced('2026-02-06T12:00:00Z');
    // toLocaleDateString output varies by locale, just check it's not a relative string
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Never');
    expect(result).not.toBe('Just now');
  });
});
