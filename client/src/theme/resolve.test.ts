import { describe, expect, it } from 'vitest';
import { resolveTheme } from './resolve';

describe('resolveTheme', () => {
  it('follows system preference in system mode', () => {
    expect(resolveTheme('system', true)).toBe('skylight-dark');
    expect(resolveTheme('system', false)).toBe('skylight');
  });

  it('passes explicit themes through regardless of system preference', () => {
    expect(resolveTheme('pride', true)).toBe('pride');
    expect(resolveTheme('bold-dark', false)).toBe('bold-dark');
  });
});
