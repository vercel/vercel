import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';
import { scopedBudgetCommand } from '../../../../src/util/budget/scoped-command';

describe('scopedBudgetCommand', () => {
  it('pins the resolved team when argv --scope names a different team', () => {
    client.setArgv(
      '--cwd',
      '/tmp',
      '--scope',
      'default-team',
      'budget',
      'set',
      '--amount',
      '500'
    );

    expect(
      stripAnsi(
        scopedBudgetCommand(
          client,
          { id: 'team_selected', slug: 'acme' },
          'budgets'
        )
      )
    ).toBe('`vercel --cwd /tmp --scope acme budgets`');
  });
});
