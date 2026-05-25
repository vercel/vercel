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

  describe('validation', () => {
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
