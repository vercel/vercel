import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleRule = {
  ownerId: 'team_abc',
  ruleId: 'rule_1',
  type: 'rewrite',
  match: { model: 'anthropic/claude-fable-5' },
  action: { rewriteModel: 'anthropic/claude-opus-4.8' },
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
};

function useListRules(rules: unknown[] = [sampleRule]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/rules', (req, res) => {
    query = req.query;
    res.json({ rules });
  });
  return () => query;
}

describe('ai-gateway rules list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'rules', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:rules', value: 'rules' },
        { key: 'flag:help', value: 'ai-gateway rules:list' },
      ]);
    });
  });

  it('lists rules in a table', async () => {
    const team = useTeam();
    useUser();
    useListRules();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('rule_1');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no rules', async () => {
    const team = useTeam();
    useUser();
    useListRules([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No routing rules found');
    expect(await exitCodePromise).toBe(0);
  });

  it('forwards --include-disabled to the API', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useListRules([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list', '--include-disabled');

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toMatchObject({ includeDisabled: 'true' });
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListRules();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'rules', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"rules"');
    expect(await exitCodePromise).toBe(0);
  });
});
