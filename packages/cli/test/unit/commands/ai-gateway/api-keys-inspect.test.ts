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

function useGetApiKey(apiKey: unknown = sampleApiKey, id = 'key_1') {
  client.scenario.get(`/v1/api-keys/${id}`, (_req, res) => {
    res.json({ apiKey });
  });
}

function useGetNotFound(id = 'missing') {
  client.scenario.get(`/v1/api-keys/${id}`, (_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'not_found', message: 'API key not found.' } });
  });
}

describe('ai-gateway api-keys inspect', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'inspect', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'flag:help', value: 'ai-gateway api-keys:inspect' },
      ]);
    });
  });

  it('shows details including quota', async () => {
    const team = useTeam();
    useUser();
    useGetApiKey();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'inspect', 'key_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('budget');
    expect(await exitCodePromise).toBe(0);
  });

  it('shows details for a key without a quota', async () => {
    const team = useTeam();
    useUser();
    const { quota, ...noQuota } = sampleApiKey;
    void quota;
    useGetApiKey(noQuota);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'inspect', 'key_1');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('production');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires an id', async () => {
    useUser();
    client.setArgv('ai-gateway', 'api-keys', 'inspect');
    const exitCodePromise = aiGateway(client);
    await expect(client.stderr).toOutput('expects an API key id');
    expect(await exitCodePromise).toBe(1);
  });

  it('reports a 404 as not found', async () => {
    const team = useTeam();
    useUser();
    useGetNotFound();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'api-keys', 'inspect', 'missing');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('API key not found');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useGetApiKey();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'api-keys',
      'inspect',
      'key_1',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"apiKey"');
    expect(await exitCodePromise).toBe(0);
  });
});
