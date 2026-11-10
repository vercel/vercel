import { describe, expect, it, vi } from 'vitest';
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
      expect(exitCode).toBe(0);

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

    it('suggests OIDC when run by an agent', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.isAgent = true;
      client.setArgv('ai-gateway', 'api-keys', 'create');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput(
        `ai-gateway api-keys revoke ${mockApiKeyResponse.apiKey.id} --yes`
      );
      expect(await exitCodePromise).toBe(0);
    });

    it('prints the static caps notice for a budget-less key without listing budgets', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create');
      const fetchSpy = vi.spyOn(client, 'fetch');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput(
        'No key budget set. Spend still counts toward any API key default, user, and team budgets. List them with `vercel ai-gateway budgets list`.'
      );
      expect(await exitCodePromise).toBe(0);
      // The notice is static: it must not fetch budgets state at all.
      expect(
        fetchSpy.mock.calls.filter(([url]) =>
          String(url).includes('/ai-gateway/budgets')
        )
      ).toEqual([]);
    });

    it('prints the static stacking notice when the key has its own budget', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '10');
      const fetchSpy = vi.spyOn(client, 'fetch');

      const exitCodePromise = aiGateway(client);

      await expect(client.stdout).toOutput(mockApiKeyResponse.apiKeyString);
      await expect(client.stderr).toOutput(
        'Spend on this key also counts toward any user and team budgets. List them with `vercel ai-gateway budgets list`.'
      );
      expect(await exitCodePromise).toBe(0);
      expect(
        fetchSpy.mock.calls.filter(([url]) =>
          String(url).includes('/ai-gateway/budgets')
        )
      ).toEqual([]);
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

  describe('--amount', () => {
    function useCaptureBody() {
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      return () => body;
    }

    async function run(...flags: string[]) {
      client.reset();
      const team = useTeam();
      useUser();
      const getBody = useCaptureBody();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--name',
        'my-key',
        ...flags
      );
      const exitCode = await aiGateway(client);
      return {
        exitCode,
        body: getBody(),
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    it('creates an API key with --amount', async () => {
      const result = await run('--amount', '500');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(mockApiKeyResponse.apiKeyString);
      expect(result.body).toMatchObject({
        aiGatewayQuota: { limitAmount: 500 },
      });
      expect(result.stderr).not.toContain('deprecated');
    });

    it.each([
      '--limit',
      '--budget',
    ])('still accepts %s, with one warning that names --amount', async oldName => {
      const now = await run('--amount', '500');
      const before = await run(oldName, '500');

      expect(before.exitCode).toBe(now.exitCode);
      expect(before.body).toEqual(now.body);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        `! ${oldName} is deprecated. Use --amount.\n`
      );
    });

    it.each([
      '--limit',
      '--budget',
    ])('rejects --amount with %s before creating a key', async oldName => {
      const result = await run('--amount', '500', oldName, '500');

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(`Can't use --amount with ${oldName}.`);
      expect(result.body).toBeUndefined();
    });

    it('rejects --limit and --budget together', async () => {
      const team = useTeam();
      useUser();
      useCreateApiKey();
      client.config.currentTeam = team.id;
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--limit',
        '500',
        '--budget',
        '500'
      );

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Pass only one of --limit or --budget'
      );
      expect(await exitCodePromise).toBe(2);
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

  describe('--token-pass', () => {
    it('creates a Token Pass key without implied quotas or exemptions', async () => {
      const team = useTeam();
      useUser();
      let body: unknown;
      client.scenario.post('/v1/api-keys', (req, res) => {
        body = req.body;
        res.json(mockApiKeyResponse);
      });
      client.config.currentTeam = team.id;
      client.setArgv('ai-gateway', 'api-keys', 'create', '--token-pass');

      expect(await aiGateway(client)).toBe(0);
      expect(body).toEqual({
        purpose: 'ai-gateway',
        metadata: { tokenPass: true },
      });
      expect(client.stdout.getFullOutput()).toBe(
        `${mockApiKeyResponse.apiKeyString}\n`
      );
      expect(client.stderr.getFullOutput()).not.toContain(
        mockApiKeyResponse.apiKeyString
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:api-keys', value: 'api-keys' },
        { key: 'subcommand:create', value: 'create' },
        { key: 'flag:token-pass', value: 'TRUE' },
      ]);
    });

    it('allows explicitly requested quota and expiry settings', async () => {
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
        '--token-pass',
        '--limit',
        '25',
        '--expiration',
        '7d'
      );

      expect(await aiGateway(client)).toBe(0);
      expect(body).toMatchObject({
        metadata: { tokenPass: true },
        aiGatewayQuota: { limitAmount: 25 },
        expiresAt: expect.any(Number),
      });
    });

    it.each([
      '--zdr-exempt',
      '--bypass-all-settings',
    ])('rejects %s before any request', async conflict => {
      const fetchSpy = vi.spyOn(client, 'fetch');
      fetchSpy.mockClear();
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--token-pass',
        conflict
      );

      expect(await aiGateway(client)).toBe(2);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot combine --token-pass with --zdr-exempt or --bypass-all-settings'
      );
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it.each([
      '--zdr-exempt',
      '--bypass-all-settings',
    ])('reports %s as an agent-mode error', async conflict => {
      client.nonInteractive = true;
      const fetchSpy = vi.spyOn(client, 'fetch');
      fetchSpy.mockClear();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.setArgv(
        'ai-gateway',
        'api-keys',
        'create',
        '--token-pass',
        conflict
      );

      await expect(aiGateway(client)).rejects.toThrow('exit');
      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        next: [{ command: 'vercel ai-gateway api-keys create --token-pass' }],
      });
      expect(client.stderr.getFullOutput()).toBe('');
      exitSpy.mockRestore();
    });

    it('documents scope and immutability in offline help', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch');
      fetchSpy.mockClear();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--help');

      expect(await aiGateway(client)).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      const text = client.stderr.getFullOutput().replace(/\s+/g, ' ');
      expect(text).toContain('--token-pass');
      expect(text).toContain('Cannot be changed after creation.');
      expect(text).toContain('create --name token-pass --token-pass');
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
      expect(await exitCodePromise).toBe(2);
    });

    it('fails with invalid --expiration', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--expiration', '5m');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput('Invalid expiration "5m"');
      expect(await exitCodePromise).toBe(2);
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
      expect(await exitCodePromise).toBe(2);
    });

    it('fails with negative --budget', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '-5');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Budget must be a positive number in dollars'
      );
      expect(await exitCodePromise).toBe(2);
    });

    it('fails with zero --budget', async () => {
      useUser();
      client.setArgv('ai-gateway', 'api-keys', 'create', '--budget', '0');

      const exitCodePromise = aiGateway(client);

      await expect(client.stderr).toOutput(
        'Budget must be a positive number in dollars'
      );
      expect(await exitCodePromise).toBe(2);
    });
  });

  describe('parent help', () => {
    it('returns exit code 2 for ai-gateway --help', async () => {
      client.setArgv('ai-gateway', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
    });

    it('returns exit code 2 for ai-gateway api-keys --help', async () => {
      client.setArgv('ai-gateway', 'api-keys', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);
    });
  });
});
