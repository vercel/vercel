import { describe, expect, it } from 'vitest';
import { getCliCommandSurface } from '../../../src/commands';

describe('getCliCommandSurface', () => {
  it('returns sorted unique command paths (root and subcommands)', () => {
    const surface = getCliCommandSurface();
    expect(surface.length).toBeGreaterThan(20);
    const sorted = [...surface].sort((a, b) => a.localeCompare(b));
    expect(surface).toEqual(sorted);
    expect(new Set(surface).size).toBe(surface.length);
    expect(surface).toContain('project');
    expect(surface).toContain('alerts');
  });
});
