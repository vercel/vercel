import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
  },
}));

import output from '../../../src/output-manager';
import { suggestNextCommands } from '../../../src/util/suggest-next-commands';

describe('suggestNextCommands()', () => {
  beforeEach(() => {
    vi.mocked(output.print).mockClear();
  });

  it('pairs each outcome with an exact command', () => {
    suggestNextCommands([
      {
        description: 'Check the deployment response',
        command: 'vercel curl https://example.vercel.app',
      },
      {
        description: 'View build logs',
        command: 'vercel inspect example.vercel.app --logs',
      },
    ]);

    const [block, newline] = vi
      .mocked(output.print)
      .mock.calls.map(([value]) => stripAnsi(value));
    expect(block).toBe(
      [
        'Next steps:',
        '- Check the deployment response:',
        '  vercel curl https://example.vercel.app',
        '- View build logs:',
        '  vercel inspect example.vercel.app --logs',
      ].join('\n')
    );
    expect(newline).toBe('\n');
    expect(block).not.toContain('Common next commands:');
  });
});
