import { describe, expect, it } from 'vitest';
import { getCliCommandSurface } from '../../../src/commands';

describe('getCliCommandSurface', () => {
  it('includes CLI–dashboard parity command paths', () => {
    const surface = getCliCommandSurface();
    expect(surface).toContain('oauth-apps');
    expect(surface).toContain('oauth-apps list-requests');
    expect(surface).toContain('alerts inspect');
    expect(surface).toContain('project protection');
    expect(surface).toContain('teams sso');
    expect(surface).toContain('domains price');
    expect(surface).toContain('integration installations');
  });
});
