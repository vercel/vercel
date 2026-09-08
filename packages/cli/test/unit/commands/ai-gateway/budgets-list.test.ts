import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam, createTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

const teamBudget = {
  quotaEntityId: 'team_abc',
  scopeType: 'team',
  scopeId: 'team_abc',
  limitAmount: 500,
  currentSpend: 120.5,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

const projectBudget = {
  ...teamBudget,
  quotaEntityId: 'prj_123',
  scopeType: 'project',
  scopeId: 'prj_123',
  limitAmount: 200,
};

const userBudget = {
  ...teamBudget,
  // The gateway prefixes the user scope id; the members roster returns it bare.
  quotaEntityId: 'usr_member',
  scopeType: 'user',
  scopeId: 'usr_member',
  limitAmount: 100,
};

const apiKeyBudget = {
  ...teamBudget,
  quotaEntityId: 'api_key_id_key_123',
  scopeType: 'api-key',
  scopeId: 'key_123',
  limitAmount: 50,
};

function useListBudgets(budgets: unknown[] = [teamBudget, projectBudget]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
    query = req.query;
    res.json({ budgets });
  });
  return () => query;
}

function defaultRow(
  scopeType: string,
  limitAmount: number,
  refreshPeriod: string
) {
  return {
    scopeType,
    limitAmount,
    refreshPeriod,
    active: true,
    createdAt: 1,
    updatedAt: 2,
  };
}

function useListDefaults(defaults: unknown[]) {
  client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
    res.json({ defaults });
  });
}

function useApiKeys(apiKeys: unknown[]) {
  client.scenario.get('/v1/api-keys', (_req, res) => {
    res.json({ apiKeys, pagination: { count: apiKeys.length, next: null } });
  });
}

function useTeamMembers(
  teamId: string,
  members: unknown[] = [
    { uid: 'member', email: 'teammate@example.com', username: 'teammate' },
  ]
) {
  let fetches = 0;
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    fetches += 1;
    res.json({ members, pagination: { count: members.length, next: null } });
  });
  return () => fetches;
}

describe('ai-gateway budgets list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:list' },
      ]);
    });
  });

  it('asks which team when none is selected', async () => {
    // Two teams and no personal scope (northstar), so the picker must ask and
    // the default choice is a team.
    useTeam();
    createTeam();
    useUser({ version: 'northstar' });
    useListBudgets([teamBudget]);
    client.config.currentTeam = undefined;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a project scope id to its name', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    useListBudgets([{ ...projectBudget, scopeId: defaultProject.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(defaultProject.name!);
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a user scope id to a member handle', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('teammate');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves user names with one batched member lookup', async () => {
    const team = useTeam();
    useUser();
    const getFetches = useTeamMembers(team.id, [
      { uid: 'member', username: 'teammate' },
      { uid: 'member2', username: 'other' },
    ]);
    useListBudgets([
      userBudget,
      { ...userBudget, quotaEntityId: 'usr_member2', scopeId: 'usr_member2' },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('other');
    expect(await exitCodePromise).toBe(0);
    expect(getFetches()).toBe(1);
  });

  it('uses the api-provided name for an api-key scope row', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...apiKeyBudget, name: 'production-key' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('production-key');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves an api-key scope id from the key roster when unnamed', async () => {
    const team = useTeam();
    useUser();
    useApiKeys([{ id: 'key_123', name: 'roster-key' }]);
    useListBudgets([apiKeyBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('roster-key');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a team scope id to its slug', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...teamBudget, scopeId: team.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(team.slug);
    expect(await exitCodePromise).toBe(0);
  });

  it('falls back to the scope id when a name cannot be resolved', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v9/projects/prj_gone', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Project not found' } });
    });
    useListBudgets([{ ...projectBudget, scopeId: 'prj_gone' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('prj_gone');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no budgets', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No budgets found');
    expect(await exitCodePromise).toBe(0);
  });

  it('summarizes default-inherited rows instead of listing them', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([
      defaultRow('project', 250, 'daily'),
      defaultRow('user', 100, 'monthly'),
    ]);
    // Inherited rows resolve no names, so a project row needs no project mock.
    useListBudgets([
      teamBudget,
      {
        ...projectBudget,
        scopeId: 'prj_inherited',
        quotaEntityId: 'prj_inherited',
        source: 'default',
      },
      {
        ...userBudget,
        scopeId: 'usr_inherited',
        quotaEntityId: 'usr_inherited',
        source: 'default',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Inherited budgets are listed by');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).not.toContain('prj_inherited');
  });

  it('keeps inherited rows in JSON output', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([
      { ...projectBudget, scopeId: 'prj_inherited', source: 'default' },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('prj_inherited');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders active defaults as a table with applied-to counts', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([defaultRow('project', 9001, 'daily')]);
    useListBudgets([
      teamBudget,
      {
        ...projectBudget,
        scopeId: 'prj_inherited',
        quotaEntityId: 'prj_inherited',
        source: 'default',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('They use the following defaults:');
    // The whole table arrives as one chunk; toOutput only sees data emitted
    // after it subscribes, so the row is asserted in a single matcher.
    await expect(client.stderr).toOutput('$9001    daily      1 project');
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a user default row with its member count', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([defaultRow('user', 50, 'monthly')]);
    useListBudgets([teamBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('0 team members');
    expect(await exitCodePromise).toBe(0);
  });
});
