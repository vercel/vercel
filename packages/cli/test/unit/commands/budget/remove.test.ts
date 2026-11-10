import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import budget from '../../../../src/commands/budget';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { buildThresholds } from '../../../../src/util/budget/api';

const activeBudget = {
  id: 'budget_1',
  ownerId: 'team_dummy',
  planId: 'plan_pro',
  amount: '500',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  scope: 'team',
  thresholds: buildThresholds({ pause: true }),
};

function useBudgets(budgets: unknown[] = [activeBudget]) {
  client.scenario.get('/v1/budgets', (_req, res) => {
    res.json({ data: budgets });
  });
}

function useDeleteBudget() {
  let deletedId: string | undefined;
  client.scenario.delete('/v1/budgets/:budgetId', (req, res) => {
    deletedId = req.params.budgetId;
    res.json({});
  });
  return () => deletedId;
}

describe('budget rm', () => {
  it('errors when no team is selected', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.setArgv('budget', 'rm', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--scope');
    expect(await exitCodePromise).toBe(2);
  });

  it('removes the active budget with --yes', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    const deleted = useDeleteBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Removed the $500 budget');
    expect(await exitCodePromise).toBe(0);
    expect(deleted()).toBe('budget_1');
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });

  it.each(['delete', 'disable'])('warns that %s is deprecated', async name => {
    const team = useTeam();
    useUser();
    useBudgets();
    const deleted = useDeleteBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', name, '--yes');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(deleted()).toBe('budget_1');
    expect(client.stderr.getFullOutput()).toContain(
      `\`vercel budgets ${name}\` is deprecated. Use \`vercel budgets remove\`.`
    );
  });

  it('exits cleanly when there is no budget', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('No budget to remove');
    expect(await exitCodePromise).toBe(0);
  });

  it('emits an already-absent receipt with --json when there is no budget', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"alreadyAbsent": true');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      ok: true,
      alreadyAbsent: true,
      disabled: null,
      teamSlug: team.slug,
      scope: 'team',
    });
  });

  it('refuses to delete non-interactively without --yes', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv('budget', 'rm');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--yes');
    expect(await exitCodePromise).toBe(2);

    client.stdin.isTTY = true;
  });

  it('refuses to delete with --non-interactive on a TTY without --yes', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = true;
    client.nonInteractive = true;
    client.setArgv('budget', 'rm');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--yes');
    expect(await exitCodePromise).toBe(2);
  });

  it('rejects positional arguments', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', 'budget_1', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "budget_1"');
    expect(await exitCodePromise).toBe(2);
  });

  it('returns exit code 0 for --help', async () => {
    client.setArgv('budget', 'rm', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);
  });

  it('emits the disabled id with --json', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useDeleteBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"disabled": "budget_1"');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('"alreadyAbsent": false');
  });

  it('cancels when the user declines the confirm', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = true;
    client.input.confirm = async () => false;
    client.setArgv('budget', 'rm');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toBe(0);
  });

  it('prints the API error when list fails', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.status(400).json({ error: { message: 'list failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('list failed');
    expect(await exitCodePromise).toBe(1);
  });

  it('prints the API error when delete fails', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    client.scenario.delete('/v1/budgets/:budgetId', (_req, res) => {
      res.status(400).json({ error: { message: 'delete failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'rm', '--yes');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('delete failed');
    expect(await exitCodePromise).toBe(1);
  });
});
