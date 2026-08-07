import { describe, expect, it } from 'vitest';
import { help } from '../../../src/help';

describe('root help output', () => {
  it('lists the agent-runs command', () => {
    expect(help()).toContain(
      'agent-runs           [cmd]       Inspect Agent Runs observability data'
    );
  });
});
