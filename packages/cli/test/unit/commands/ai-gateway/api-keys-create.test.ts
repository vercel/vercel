import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

const mockApiKeyResponse = {
  apiKeyString: 'uRKJSTt0L4RaSecretKey123',
  apiKey: {
    id: '5d9f2ebd38dd',
    name: 'my-key',
    partialKey: 't7V',
    teamId: 'team_abc',
    purpose: 'ai-gateway',
    createdAt: 1700000000000,
  },
};

function useCreateApiKey(response = mockApiKeyResponse) {
  client.scenario.post('/v1/api-keys', (_req, res) => {
    res.json(response);
  });
}

describe('ai-gateway api-keys create', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'api-keys', 'create', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:api-keys',
          value: 'api-keys',
        },
        {
          key: 'flag:help',
          value: 'ai-gateway api-keys:create',
        },
      ]);
    });
  });

  describe('success with no flags (all defaults)', () => {
    it('creates an API key successfully', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput('API key');
      expect(await exitCodePromise).toBe(0);
    });

    it('names the caps a budget-less key still counts toward', async () => {
      const team = useTeam();
      const user = useUser();
      useCreateApiKey();
      client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
        res.json({
          defaults: [
            {
              scopeType: 'api-key',
              limitAmount: 50,
              refreshPeriod: 'monthly',
              active: true,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        });
      });
      client.scenario.get('/ai-gateway/budgets/list', (_req, res) => {
        res.json({
          budgets: [
            {
              quotaEntityId: 'team_1',
              scopeType: 'team',
              scopeId: team.id,
              limitAmount: 500,
              currentSpend: 0,
              currentByokSpend: 0,
              includeByokInQuota: false,
              refreshPeriod: 'monthly',
              active: true,
              archived: false,
              createdAt: 1,
              updatedAt: 2,
            },
            {
              quotaEntityId: 'user_1',
              scopeType: 'user',
              scopeId: `usr_${user.id}`,
              limitAmount: 100,
              currentSpend: 0,
              currentByokSpend: 0,
              includeByokInQuota: false,
              refreshPeriod: 'weekly',
              active: true,
              archived: false,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        });
      });
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput(
        'No key budget set. Spend still counts toward the API key default ($50 a month), your user budget ($100 a week) and the team budget ($500 a month).'
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('names the stacking caps when the key has its own budget', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
        res.json({
          defaults: [
            {
              scopeType: 'api-key',
              limitAmount: 50,
              refreshPeriod: 'monthly',
              active: true,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        });
      });
      client.scenario.get('/ai-gateway/budgets/list', (_req, res) => {
        res.json({
          budgets: [
            {
              quotaEntityId: 'team_1',
              scopeType: 'team',
              scopeId: team.id,
              limitAmount: 500,
              currentSpend: 0,
              currentByokSpend: 0,
              includeByokInQuota: false,
              refreshPeriod: 'monthly',
              active: true,
              archived: false,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        });
      });
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '10');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      // The api-key default is overridden by the explicit budget, so only the
      // team cap is named, with the budgeted lead-in.
      await expect(client.stderr).toOutput(
        'Spend on this key also counts toward the team budget ($500 a month).'
      );
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('success with all flags', () => {
    it('creates an API key with all options', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--name',
        'my-key',
        '--budget',
        '500',
        '--refresh-period',
        'monthly',
        '--include-byok'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput('API key');
      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('success with expiration and alert thresholds', () => {
    it('creates an API key with --expiration and --alert-thresholds', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--budget',
        '500',
        '--alert-thresholds',
        '75,100',
        '--expiration',
        '90d'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      expect(await exitCodePromise).toBe(0);
      expect(body).toMatchObject({
        aiGatewayQuota: { limitAmount: 500, alertThresholds: [75, 100] },
      });
      expect((body as { expiresAt?: number }).expiresAt).toBeTypeOf('number');
    });
  });

  describe('success with --zdr-exempt', () => {
    it('sends the zdr metadata fact and tracks the flag', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--name',
        'escape-hatch',
        '--zdr-exempt'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      expect(await exitCodePromise).toBe(0);
      expect(body).toMatchObject({
        metadata: { zdr: { enableNonZdrModels: true } },
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'subcommand:create', value: 'create' },
        { key: 'option:name', value: '[REDACTED]' },
        { key: 'flag:zdr-exempt', value: 'TRUE' },
      ]);
    });

    it('omits metadata when the flag is not passed', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      expect(await exitCodePromise).toBe(0);
      expect(body).not.toHaveProperty('metadata');
    });
  });

  describe('success with --bypass-all-settings', () => {
    it('sends the bypassAll metadata fact and tracks the flag', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--name',
        'escape-hatch',
        '--bypass-all-settings'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      expect(await exitCodePromise).toBe(0);
      expect(body).toMatchObject({
        metadata: { bypassAll: true },
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'subcommand:create', value: 'create' },
        { key: 'option:name', value: '[REDACTED]' },
        { key: 'flag:bypass-all-settings', value: 'TRUE' },
      ]);
    });

    it('merges both facts when --zdr-exempt and --bypass-all-settings are passed', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--zdr-exempt',
        '--bypass-all-settings'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      expect(await exitCodePromise).toBe(0);
      expect(body).toMatchObject({
        metadata: { zdr: { enableNonZdrModels: true }, bypassAll: true },
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'subcommand:create', value: 'create' },
        { key: 'flag:zdr-exempt', value: 'TRUE' },
        { key: 'flag:bypass-all-settings', value: 'TRUE' },
      ]);
    });
  });

  describe('validation', () => {
    it('fails with invalid --alert-thresholds', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--alert-thresholds',
        '80'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Invalid alert threshold "80"');
      expect(await exitCodePromise).toBe(1);
    });

    it('fails with invalid --expiration', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--expiration', '5m');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Invalid expiration "5m"');
      expect(await exitCodePromise).toBe(1);
    });

    it('fails with invalid --refresh-period', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--refresh-period',
        'yearly'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Invalid refresh period "yearly"');
      expect(await exitCodePromise).toBe(1);
    });

    it('fails with negative --budget', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '-5');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Budget must be a positive number in dollars'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('fails with zero --budget', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '0');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Budget must be a positive number in dollars'
      );
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('parent help', () => {
    it('returns exit code 2 for ai-gateway --help', async () => {
      client.setArgv('ai-gateway', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);
    });

    it('returns exit code 2 for ai-gateway api-keys --help', async () => {
      client.setArgv('ai-gateway', 'api-keys', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);
    });
  });
});
