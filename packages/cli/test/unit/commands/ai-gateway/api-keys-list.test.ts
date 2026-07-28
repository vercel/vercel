import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const sampleApiKey = {
  id: 'key_1',
  name: 'production',
  partialKey: 't7V',
  teamId: 'team_abc',
  purpose: 'ai-gateway',
  projectId: null,
  expiresAt: null,
  activeAt: 1700000000000,
  createdAt: 1700000000000,
  createdBy: 'user_1',
  leakedAt: null,
  leakedUrl: null,
  createdByAppId: null,
  quota: {
    quotaEntityId: 'quota_1',
    limitAmount: 500,
    currentSpend: 42,
    currentByokSpend: 0,
    includeByokInQuota: false,
    refreshPeriod: 'monthly',
    active: true,
    archived: false,
    alertThresholds: [75, 100],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
};

function useListApiKeys(apiKeys: unknown[] = [sampleApiKey]) {
  let query: unknown;
  client.scenario.get('/v1/api-keys', (req, res) => {
    query = req.query;
    res.json({
      apiKeys,
      pagination: { count: apiKeys.length, next: null, prev: null },
    });
  });
  return () => query;
}

describe('ai-gateway api-keys list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'flag:help', value: 'ai-gateway api-keys:list' },
      ]);
    });
  });

  it('lists API keys in a table', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useListApiKeys();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('production');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ purpose: 'ai-gateway' });
  });

  it('reports when there are no API keys', async () => {
    const team = useTeam();
    useUser();
    useListApiKeys([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No API keys found');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListApiKeys();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"apiKeys"');
    expect(await exitCodePromise).toBe(0);
  });

  it('fails without a team in non-interactive mode', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'api-keys', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No team selected');
    expect(await exitCodePromise).toBe(1);
  });
});
