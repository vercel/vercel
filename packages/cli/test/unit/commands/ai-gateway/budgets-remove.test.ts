import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

function useRemoveBudget() {
  let query: unknown;
  client.scenario.delete('/ai-gateway/budgets', (req, res) => {
    query = req.query;
    res.json({});
  });
  return () => query;
}

describe('ai-gateway budgets remove', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'remove', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:remove' },
      ]);
    });
  });

  it('removes the team budget with --yes', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('team budget');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ scopeType: 'team' });
  });

  it('removes a project budget, resolving the project name to an id', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    const getQuery = useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'rm',
      'project',
      defaultProject.name!,
      '--yes'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toMatchObject({
      scopeType: 'project',
      projectId: defaultProject.id,
    });
  });

  it('requires --yes in non-interactive mode', async () => {
    const team = useTeam();
    useUser();
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.nonInteractive = true;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('--yes');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'remove',
      'team',
      '--yes',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"removed": true');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires a scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'remove', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Expected a scope');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an unknown scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'remove', 'user', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown scope');
    expect(await exitCodePromise).toBe(1);
  });
});
