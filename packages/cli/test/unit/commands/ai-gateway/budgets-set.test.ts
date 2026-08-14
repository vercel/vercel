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
    client.setArgv('ai-gateway', 'budgets', 'set', 'user', '--limit', '100');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown scope');
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
