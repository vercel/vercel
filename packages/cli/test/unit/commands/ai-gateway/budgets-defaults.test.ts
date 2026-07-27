import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const budgetDefault = {
  teamId: 'team_abc',
  perProjectLimit: 200,
  perApiKeyLimit: 50,
  refreshPeriod: 'monthly',
  active: true,
  createdAt: 1,
  updatedAt: 2,
};

function useGetBudgetDefault(body: unknown = budgetDefault) {
  client.scenario.get('/ai-gateway/budgets/defaults', (_req, res) => {
    res.json(body);
  });
}

function useUpsertBudgetDefault(response: unknown = budgetDefault) {
  let captured: unknown;
  client.scenario.put('/ai-gateway/budgets/defaults', (req, res) => {
    captured = req.body;
    res.json(response);
  });
  return () => captured;
}

function useDeleteBudgetDefault() {
  client.scenario.delete('/ai-gateway/budgets/defaults', (_req, res) => {
    res.json({});
  });
}

describe('ai-gateway budgets defaults', () => {
  describe('inspect', () => {
    it('shows the default policy', async () => {
      const team = useTeam();
      useUser();
      useGetBudgetDefault();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'inspect');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Per project');
      expect(await exitCodePromise).toBe(0);
    });

    it('reports when no default policy is set', async () => {
      const team = useTeam();
      useUser();
      useGetBudgetDefault(null);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'inspect');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('No budget default set');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('set', () => {
    it('upserts the per-project and per-api-key tiers', async () => {
      const team = useTeam();
      useUser();
      const getBody = useUpsertBudgetDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        '--per-project',
        '200',
        '--per-api-key',
        '50',
        '--refresh-period',
        'monthly'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Set budget default');
      expect(await exitCodePromise).toBe(0);
      expect(getBody()).toMatchObject({
        perProjectLimit: 200,
        perApiKeyLimit: 50,
        refreshPeriod: 'monthly',
      });
    });

    it('clears a tier with none', async () => {
      const team = useTeam();
      useUser();
      const getBody = useUpsertBudgetDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        '--per-project',
        'none',
        '--refresh-period',
        'monthly'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      expect(getBody()).toMatchObject({
        perProjectLimit: null,
        refreshPeriod: 'monthly',
      });
    });

    it('reuses the existing refresh period when omitted', async () => {
      const team = useTeam();
      useUser();
      useGetBudgetDefault({ ...budgetDefault, refreshPeriod: 'weekly' });
      const getBody = useUpsertBudgetDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        '--per-project',
        '300'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      expect(getBody()).toMatchObject({
        perProjectLimit: 300,
        refreshPeriod: 'weekly',
      });
    });

    it('errors when no tier or refresh period is passed', async () => {
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'set');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Nothing to set');
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects a tier amount below 1', async () => {
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        '--per-project',
        '0'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('at least 1');
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('remove', () => {
    it('archives the policy with --yes', async () => {
      const team = useTeam();
      useUser();
      useDeleteBudgetDefault();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove', '--yes');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Removed');
      expect(await exitCodePromise).toBe(0);
    });

    it('requires --yes in non-interactive mode', async () => {
      const team = useTeam();
      useUser();
      client.nonInteractive = true;
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('--yes');
      expect(await exitCodePromise).toBe(1);
    });
  });
});
