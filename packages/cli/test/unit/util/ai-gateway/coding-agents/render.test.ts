import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupPlan } from '../../../../../src/util/ai-gateway/coding-agents/apply';
import { cursor } from '../../../../../src/util/ai-gateway/coding-agents/agents/cursor';
import { pi } from '../../../../../src/util/ai-gateway/coding-agents/agents/pi';
import { printNotes } from '../../../../../src/util/ai-gateway/coding-agents/render';

const output = vi.hoisted(() => ({
  print: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../../../../src/output-manager', () => ({ default: output }));

let previousChalkLevel: typeof chalk.level;

beforeEach(() => {
  output.print.mockReset();
  output.log.mockReset();
  previousChalkLevel = chalk.level;
  chalk.level = 0;
});

afterEach(() => {
  chalk.level = previousChalkLevel;
});

describe('AI Gateway coding-agent notes', () => {
  it('separates an ordered setup sequence from later bullets', () => {
    printNotes(examplePlan());

    expect(output.print).toHaveBeenCalledWith(
      [
        '',
        '  Next steps:',
        '',
        '! Cursor [Action Required]',
        '    Complete setup:',
        '    1. Open Settings.',
        '       command',
        '    2. Save the settings.',
        '',
        '    - Note one.',
        '    - Note two.',
        '',
        '  Pi',
        '    - Choose a model.',
        '',
      ].join('\n')
    );
  });

  it('renders the required-action marker and label in red', () => {
    chalk.level = 1;

    printNotes(examplePlan());

    const rendered = output.print.mock.calls[0][0] as string;
    expect(rendered).toContain('\u001b[31m!\u001b[39m');
    expect(rendered).toContain('\u001b[31m[Action Required]\u001b[39m');
    expect(stripAnsi(rendered)).toContain('! Cursor [Action Required]');
  });

  it('marks only Cursor as requiring additional setup', () => {
    const context = {
      apiKey: 'vck_test',
      home: '/tmp/ai-gateway-render-test',
      useKeychain: true,
    };

    expect(cursor.buildPlan(context).actionRequired).toBe(true);
    expect(Boolean(pi.buildPlan(context).actionRequired)).toBe(false);
  });
});

function examplePlan(): SetupPlan {
  return {
    changes: [],
    envExports: [],
    migrations: [],
    notes: [
      {
        id: 'cursor',
        displayName: 'Cursor',
        actionRequired: true,
        notes: [
          'Complete setup:',
          '1. Open Settings.',
          '   command',
          '2. Save the settings.',
          'Note one.',
          'Note two.',
        ],
      },
      {
        id: 'pi',
        displayName: 'Pi',
        actionRequired: false,
        notes: ['Choose a model.'],
      },
    ],
  };
}
