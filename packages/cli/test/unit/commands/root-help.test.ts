import { describe, expect, it } from 'vitest';
import { help } from '../../../src/help';

describe('root help output', () => {
  it('lists the agent-runs command', () => {
    expect(help()).toContain(
      'agent-runs           [cmd]       Inspect Agent Runs observability data'
    );
  });

  it('lists the changelog command and global option', () => {
    expect(help()).toContain(
      'changelog            [cmd]       Show the latest Vercel product updates'
    );
    expect(help()).toContain(
      '--changelog                    Show the 5 latest Vercel product updates'
    );
    expect(help()).toContain('$ vercel --changelog');
    expect(help()).toContain('$ vercel changelog search "AI SDK"');
  });
});
