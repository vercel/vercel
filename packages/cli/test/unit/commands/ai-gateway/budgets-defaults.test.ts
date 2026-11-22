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
      });
      expect(getBody()).not.toHaveProperty('refreshPeriod');
    });

    it('removes the user default with --yes', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([userDefault]);
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

    it('omits refreshPeriod for a new default (the server defaults it to monthly)', async () => {
      const team = useTeam();
      useUser();
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
      });
      expect(getBody()).not.toHaveProperty('refreshPeriod');
    });

    it('omits refreshPeriod when only --limit is given (the server preserves the cadence)', async () => {
      const team = useTeam();
      useUser();
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
      });
      expect(getBody()).not.toHaveProperty('refreshPeriod');
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
      expect(await exitCodePromise).toBe(2);
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
      expect(await exitCodePromise).toBe(2);
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
      expect(await exitCodePromise).toBe(2);
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
      useListDefaults([projectDefault]);
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

    it('warns that delete is deprecated', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([projectDefault]);
      useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'delete',
        'project',
        '--yes'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        '`vercel ai-gateway budgets defaults delete` is deprecated. Use `vercel ai-gateway budgets defaults remove`.'
      );
      expect(await exitCodePromise).toBe(0);
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
      useListDefaults([projectDefault]);
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
      expect(await exitCodePromise).toBe(2);
    });

    it('outputs JSON with --format json', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([projectDefault]);
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

  describe('deprecation', () => {
    it('warns and still runs when the defaults group is used', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([projectDefault]);
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'budgets', 'defaults', 'list');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('deprecated');
      expect(await exitCodePromise).toBe(0);
      await expect(client.stdout).toOutput('project');
    });

    it('points the warning at the --default flag and --defaults view', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      useUpsertDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'set',
        'project',
        '--limit',
        '200'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      const err = client.stderr.getFullOutput();
      expect(err).toContain('deprecated');
      expect(err).toContain('vercel ai-gateway budgets set user --default');
      expect(err).toContain('budgets ls --defaults');
    });

    it('hides the defaults group from budgets help', async () => {
      client.setArgv('ai-gateway', 'budgets', '--help');

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('defaults');
    });

    it('does not warn when showing the group help', async () => {
      client.setArgv('ai-gateway', 'budgets', 'defaults', '--help');

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it('errors instead of reporting success when no default exists', async () => {
      const team = useTeam();
      useUser();
      useListDefaults([]);
      useDeleteDefault();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'budgets',
        'defaults',
        'remove',
        'project',
        '--yes'
      );

      const exitCode = await aiGateway(client);

      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'No project budget default set'
      );
    });
  });
});

describe('ai-gateway budgets defaults set --amount', () => {
  async function run(...args: string[]) {
    client.reset();
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
      ...args
    );
    const exitCode = await aiGateway(client);
    return {
      exitCode,
      body: getBody(),
      stdout: client.stdout.getFullOutput(),
      // The group itself warns that it is deprecated.
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('still accepts --limit, with one more warning that names --amount', async () => {
    const now = await run('--amount', '200');
    const before = await run('--limit', '200');

    expect(now.exitCode).toBe(0);
    expect(now.body).toMatchObject({ limitAmount: 200 });
    expect(now.stderr).not.toContain('--limit is deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.body).toEqual(now.body);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/--limit is deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain('! --limit is deprecated. Use --amount.\n');
  });

  it('rejects --amount with --limit before any request', async () => {
    const result = await run('--amount', '200', '--limit', '200');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Can't use --amount with --limit.");
    expect(result.body).toBeUndefined();
  });
});
