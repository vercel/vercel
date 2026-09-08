import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

const teamBudget = {
  quotaEntityId: 'team_abc',
  scopeType: 'team',
  scopeId: 'team_abc',
  limitAmount: 500,
  currentSpend: 0,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

function useSetBudget(response: unknown = teamBudget) {
  let body: unknown;
  client.scenario.put('/ai-gateway/budgets', (req, res) => {
    body = req.body;
    res.json(response);
  });
  return () => body;
}

const apiKey = {
  id: 'key_123',
  name: 'prod-key',
  purpose: 'ai-gateway',
};

const apiKeyQuota = {
  quotaEntityId: 'api_key_id_key_123',
  limitAmount: 50,
  currentSpend: 0,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

function useGetApiKey(key = apiKey) {
  client.scenario.get(`/v1/api-keys/${key.id}`, (_req, res) => {
    res.json({ apiKey: key });
  });
}

function useApiKeyNotFound(id: string) {
  client.scenario.get(`/v1/api-keys/${id}`, (_req, res) => {
    res.statusCode = 404;
    res.json({ error: { code: 'not_found', message: 'API key not found' } });
  });
}

function useListApiKeys(apiKeys: unknown[]) {
  client.scenario.get('/v1/api-keys', (_req, res) => {
    res.json({ apiKeys, pagination: { count: apiKeys.length, next: null } });
  });
}

function useUpdateApiKeyQuota(quota: unknown = apiKeyQuota) {
  let body: unknown;
  client.scenario.patch('/v1/api-keys/:id/quota', (req, res) => {
    body = req.body;
    res.json({ apiKey, quota });
  });
  return () => body;
}

const teamMember = {
  uid: 'usr_member',
  email: 'teammate@example.com',
  username: 'teammate',
  role: 'MEMBER',
};

function useTeamMembers(teamId: string, members = [teamMember]) {
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    res.json({ members, pagination: { count: members.length, next: null } });
  });
}

describe('ai-gateway budgets set', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'set', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:set' },
      ]);
    });
  });

  it('sets a team budget', async () => {
    const team = useTeam();
    useUser();
    const getBody = useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'team',
      '--limit',
      '500',
      '--refresh-period',
      'monthly'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Set budget');
    expect(await exitCodePromise).toBe(0);
    expect(getBody()).toMatchObject({
      scopeType: 'team',
      limitAmount: 500,
      refreshPeriod: 'monthly',
    });
  });

  it('sets a project budget, resolving the project name to an id', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    const getBody = useSetBudget({
      ...teamBudget,
      quotaEntityId: defaultProject.id,
      scopeType: 'project',
      scopeId: defaultProject.id,
      limitAmount: 200,
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'project',
      defaultProject.name!,
      '--limit',
      '200'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      scopeType: 'project',
      projectId: defaultProject.id,
      limitAmount: 200,
    });
  });

  it('requires a --limit of at least 1', async () => {
    client.setArgv('ai-gateway', 'budgets', 'set', 'team', '--limit', '0');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('--limit');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an invalid --refresh-period', async () => {
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'team',
      '--limit',
      '100',
      '--refresh-period',
      'hourly'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('--refresh-period');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'team',
      '--limit',
      '500',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"quotaEntityId"');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires a scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'set', '--limit', '100');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Expected a scope');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an unknown scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'set', 'org', '--limit', '100');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown scope');
    expect(await exitCodePromise).toBe(1);
  });

  it('sets an api-key budget via the key id', async () => {
    const team = useTeam();
    useUser();
    useGetApiKey();
    const getBody = useUpdateApiKeyQuota();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'api-key',
      'key_123',
      '--limit',
      '50'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      limitAmount: 50,
      active: true,
      archived: false,
    });
  });

  it('sets an api-key budget, resolving the key name to an id', async () => {
    const team = useTeam();
    useUser();
    useApiKeyNotFound('prod-key');
    useListApiKeys([apiKey]);
    const getBody = useUpdateApiKeyQuota();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'api-key',
      'prod-key',
      '--limit',
      '50'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ limitAmount: 50 });
  });

  it('errors when the api key cannot be resolved', async () => {
    const team = useTeam();
    useUser();
    useApiKeyNotFound('ghost');
    useListApiKeys([]);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'api-key',
      'ghost',
      '--limit',
      '50'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('API key not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('sets a user budget, resolving the identifier to a user id', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    const getBody = useSetBudget({
      ...teamBudget,
      quotaEntityId: `api_key_id_${teamMember.uid}`,
      scopeType: 'user',
      scopeId: teamMember.uid,
      limitAmount: 100,
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'user',
      teamMember.email,
      '--limit',
      '100'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({
      scopeType: 'user',
      userId: teamMember.uid,
      limitAmount: 100,
    });
  });

  it('errors when the user identifier cannot be resolved', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id, []);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'user',
      'nobody@example.com',
      '--limit',
      '100'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Team member not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('requires a user identifier', async () => {
    client.setArgv('ai-gateway', 'budgets', 'set', 'user', '--limit', '100');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('user scope requires');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects a name on the team scope', async () => {
    client.setArgv(
      'ai-gateway',
      'budgets',
      'set',
      'team',
      'oops',
      '--limit',
      '100'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('team scope does not take a name');
    expect(await exitCodePromise).toBe(1);
  });

  it('requires a project name', async () => {
    client.setArgv('ai-gateway', 'budgets', 'set', 'project', '--limit', '100');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('project scope requires');
    expect(await exitCodePromise).toBe(1);
  });
});
