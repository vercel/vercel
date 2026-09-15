import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const projectDefault = {
  scopeType: 'project',
  limitAmount: 200,
  refreshPeriod: 'monthly',
  active: true,
  createdAt: 1,
  updatedAt: 2,
};

const apiKeyDefault = {
  scopeType: 'api-key',
  limitAmount: 50,
  refreshPeriod: 'daily',
  active: true,
  createdAt: 1,
  updatedAt: 2,
};

const userDefault = {
  scopeType: 'user',
  limitAmount: 20,
  refreshPeriod: 'monthly',
  active: true,
  createdAt: 1,
  updatedAt: 2,
};

function useListDefaults(defaults: unknown[]) {
  client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
    res.json({ defaults });
  });
}

function useUpsertDefault(response: unknown = projectDefault) {
  let captured: unknown;
  client.scenario.put('/ai-gateway/budgets/defaults', (req, res) => {
    captured = req.body;
    res.json(response);
  });
  return () => captured;
}

function useDeleteDefault() {
  let query: unknown;
  client.scenario.delete('/ai-gateway/budgets/defaults', (req, res) => {
    query = req.query;
    res.json({});
  });
  return () => query;
}

describe('ai-gateway budgets defaults', () => {
  describe('list', () => {
    it('lists project and api-key defaults in a table', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([projectDefault, apiKeyDefault]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('api-key');
      expect(await exitCodePromise).toBe(0);
    });

    it('lists a user default and hides the team tier', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([
        userDefault,
        {
          scopeType: 'team',
          limitAmount: 999,
          refreshPeriod: 'monthly',
          active: true,
          createdAt: 1,
          updatedAt: 2,
        },
      ]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('user');
      expect(await exitCodePromise).toBe(0);
    });

    it('sets a user default', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      const getBody = useUpsertDefault(userDefault);
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'user',
        '--limit',
        '20'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('every team member');
      expect(await exitCodePromise).toBe(0);
      expect(getBody()).toMatchObject({
        scopeType: 'user',
        limitAmount: 20,
        refreshPeriod: 'monthly',
      });
    });

    it('removes the user default with --yes', async () => {
      const team = useTeam();
      useUser();
      const getQuery = useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'remove',
        'user',
        '--yes'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Removed');
      expect(await exitCodePromise).toBe(0);
      expect(getQuery()).toMatchObject({ scopeType: 'user' });
    });

    it('reports when there are no defaults', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'ls');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('No budget defaults set');
      expect(await exitCodePromise).toBe(0);
    });

    it('outputs JSON with --format json', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([projectDefault]);
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'list',
        '--format',
        'json'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('"defaults"');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('set', () => {
    it('sets the project default', async () => {
      const team = useTeam();
      useUser();
      const getBody = useUpsertDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'project',
        '--limit',
        '200',
        '--refresh-period',
        'monthly'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Set default');
      expect(await exitCodePromise).toBe(0);
      expect(getBody()).toMatchObject({
        scopeType: 'project',
        limitAmount: 200,
        refreshPeriod: 'monthly',
      });
    });

    it('defaults the refresh period to monthly for a new default', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      const getBody = useUpsertDefault(apiKeyDefault);
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'api-key',
        '--limit',
        '50'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      expect(getBody()).toMatchObject({
        scopeType: 'api-key',
        limitAmount: 50,
        refreshPeriod: 'monthly',
      });
    });

    it('keeps the existing refresh period when only --limit is given', async () => {
      const team = useTeam();
      useUser();
      // The api-key default is daily; bumping the limit alone must not reset
      // the cadence to monthly.
      useListDefaults([apiKeyDefault]);
      const getBody = useUpsertDefault({ ...apiKeyDefault, limitAmount: 80 });
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'api-key',
        '--limit',
        '80'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'every API key without its own budget'
      );
      expect(await exitCodePromise).toBe(0);
      expect(getBody()).toMatchObject({
        scopeType: 'api-key',
        limitAmount: 80,
        refreshPeriod: 'daily',
      });
    });

    it('requires a scope', async () => {
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        '--limit',
        '100'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Expected a scope');
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects an unsupported scope', async () => {
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'team',
        '--limit',
        '100'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Unknown scope');
      expect(await exitCodePromise).toBe(1);
    });

    it('requires a --limit of at least 1', async () => {
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'project',
        '--limit',
        '0'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('--limit');
      expect(await exitCodePromise).toBe(1);
    });

    it('outputs JSON with --format json', async () => {
      const team = useTeam();
      useUser();
      useUpsertDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'project',
        '--limit',
        '200',
        '--format',
        'json'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('"limitAmount"');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('remove', () => {
    it('removes a scope default with --yes', async () => {
      const team = useTeam();
      useUser();
      const getQuery = useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'remove',
        'project',
        '--yes'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Removed');
      expect(await exitCodePromise).toBe(0);
      expect(getQuery()).toMatchObject({ scopeType: 'project' });
    });

    it('requires --yes in non-interactive mode', async () => {
      const team = useTeam();
      useUser();
      client.nonInteractive = true;
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove', 'project');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('--yes');
      expect(await exitCodePromise).toBe(1);
    });

    it('requires --yes when stdin is not a TTY', async () => {
      const team = useTeam();
      useUser();
      client.stdin.isTTY = false;
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove', 'project');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('re-run with --yes');
      expect(await exitCodePromise).toBe(1);
    });

    it('states what removing the default means before confirming', async () => {
      const team = useTeam();
      useUser();
      useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove', 'project');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Projects without their own budget will have'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Canceled');
      expect(await exitCodePromise).toBe(0);
    });

    it('requires a scope', async () => {
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'remove', '--yes');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Expected a scope');
      expect(await exitCodePromise).toBe(1);
    });

    it('outputs JSON with --format json', async () => {
      const team = useTeam();
      useUser();
      useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'remove',
        'project',
        '--yes',
        '--format',
        'json'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput('"removed": true');
      expect(await exitCodePromise).toBe(0);
    });
  });
});
