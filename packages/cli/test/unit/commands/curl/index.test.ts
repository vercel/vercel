import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import curl from '../../../../src/commands/curl';
import { getDeploymentUrlById } from '../../../../src/commands/curl/deployment-url';
import { getDeploymentUrlAndToken } from '../../../../src/commands/curl/shared';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';

const MOCK_ACCOUNT_ID = 'team_test123';

let spawnMock: ReturnType<typeof vi.fn>;
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('curl', () => {
  let originalProcessArgv: string[];

  const setupLinkedProject = async () => {
    const { setupUnitFixture } = await import(
      '../../../helpers/setup-unit-fixture'
    );
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;

    useUser();
    useTeams('team_dummy');
    useProject({
      id: 'static',
      name: 'static-project',
      latestDeployments: [
        {
          url: 'static-project-abc123.vercel.app',
        },
      ],
    });
  };

  beforeEach(async () => {
    originalProcessArgv = process.argv;

    const childProcess = await import('child_process');
    spawnMock = vi.mocked(childProcess.spawn);

    spawnMock.mockReturnValue({
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 0);
        }
        return this;
      }),
    } as any);
  });

  afterEach(() => {
    process.argv = originalProcessArgv;
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('curl', '--help');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Execute curl with automatic deployment URL and protection bypass'
      );
    });
  });

  describe('argument parsing', () => {
    it('should reject when no path is provided', async () => {
      client.setArgv('curl');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should reject when only -- is provided without a path', async () => {
      client.setArgv(
        'curl',
        '--',
        '--header',
        'Content-Type: application/json'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should accept / as a valid path', async () => {
      await setupLinkedProject();

      client.setArgv('curl', '/', '--protection-bypass', 'test-secret');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should reject when a full https URL is provided as the path', async () => {
      client.setArgv('curl', 'https://example.com/api/hello');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must be a relative API path');
    });

    it('should reject when a full http URL is provided as the path', async () => {
      client.setArgv('curl', 'http://localhost:3000/');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must be a relative API path');
    });

    it('should reject unrecognized flags before --', async () => {
      client.setArgv('curl', '/api/hello', '--invalid-flag');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('should handle process.argv parsing for curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--',
        '--header',
        'Content-Type: application/json',
        '--request',
        'POST',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--header',
        'Content-Type: application/json',
        '--request',
        'POST',
      ]);
    });

    it('should preserve arguments with spaces in process.argv', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--',
        '--header',
        'X-Custom-Header: value with spaces',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--header',
        'X-Custom-Header: value with spaces',
      ]);
      expect(curlFlags[1]).toBe('X-Custom-Header: value with spaces');
    });
  });

  describe('--deployment flag', () => {
    it('should accept deployment ID with dpl_ prefix', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      const separatorIndex = client.argv.indexOf('--');
      expect(separatorIndex).toBe(-1); // No -- separator in this case
    });

    it('should accept deployment ID without dpl_ prefix', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      const deploymentIndex = client.argv.indexOf('--deployment');
      expect(deploymentIndex).toBeGreaterThan(-1);
      expect(client.argv[deploymentIndex + 1]).toBe(
        'ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
    });

    it('should work with --deployment and curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--deployment',
        'ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--',
        '--header',
        'Content-Type: application/json',
      ];
      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual(['--header', 'Content-Type: application/json']);
    });

    it('should accept a full deployment URL', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'https://deployment-xyz789.vercel.app',
        '--protection-bypass',
        'test-secret'
      );

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:deployment',
          value: 'url',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--protection-bypass flag', () => {
    it('should accept a protection bypass secret', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-token'
      );

      const bypassIndex = client.argv.indexOf('--protection-bypass');
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(client.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with both --deployment and --protection-bypass', async () => {
      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'my-secret-token'
      );

      const deploymentIndex = client.argv.indexOf('--deployment');
      const bypassIndex = client.argv.indexOf('--protection-bypass');

      expect(deploymentIndex).toBeGreaterThan(-1);
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(client.argv[deploymentIndex + 1]).toBe(
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      expect(client.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with --protection-bypass and curl flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-token',
        '--',
        '--request',
        'POST',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual(['--request', 'POST']);

      // Verify --protection-bypass is before the separator
      const bypassIndex = process.argv.indexOf('--protection-bypass');
      expect(bypassIndex).toBeGreaterThan(-1);
      expect(bypassIndex).toBeLessThan(separatorIndex);
      expect(process.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should work with all flags combined', () => {
      process.argv = [
        'node',
        'vercel',
        'curl',
        '/api/protected',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'my-secret-token',
        '--',
        '--request',
        'POST',
        '--header',
        'Content-Type: application/json',
        '--data',
        '{"key": "value"}',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const curlFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(curlFlags).toEqual([
        '--request',
        'POST',
        '--header',
        'Content-Type: application/json',
        '--data',
        '{"key": "value"}',
      ]);

      const deploymentIndex = process.argv.indexOf('--deployment');
      const bypassIndex = process.argv.indexOf('--protection-bypass');

      expect(deploymentIndex).toBeLessThan(separatorIndex);
      expect(bypassIndex).toBeLessThan(separatorIndex);
      expect(process.argv[deploymentIndex + 1]).toBe(
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      expect(process.argv[bypassIndex + 1]).toBe('my-secret-token');
    });

    it('should handle protection bypass secret with special characters', async () => {
      const secretWithSpecialChars = 'abc123-XYZ_456.789~token';
      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        secretWithSpecialChars
      );

      const bypassIndex = client.argv.indexOf('--protection-bypass');
      expect(client.argv[bypassIndex + 1]).toBe(secretWithSpecialChars);
    });
  });

  describe('error handling', () => {
    it('should handle getOrCreateDeploymentProtectionToken failure gracefully', async () => {
      // Import setupUnitFixture to use a real fixture
      const { setupUnitFixture } = await import(
        '../../../helpers/setup-unit-fixture'
      );
      const cwd = setupUnitFixture('commands/deploy/static');
      client.cwd = cwd;

      // Mock the bypass-token module to throw an error
      const bypassTokenModule = await import(
        '../../../../src/commands/curl/bypass-token'
      );

      const mockSpy = vi
        .spyOn(bypassTokenModule, 'getOrCreateDeploymentProtectionToken')
        .mockRejectedValue(
          new Error('Failed to create deployment protection bypass token')
        );

      useUser();
      useTeams('team_dummy'); // Matches the orgId in the fixture
      useProject({
        id: 'static', // Matches the projectId in the fixture
        name: 'static-project',
        latestDeployments: [
          {
            url: 'static-project-abc123.vercel.app',
          },
        ],
      });

      client.setArgv('curl', '/api/hello');

      const exitCode = await curl(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'Failed to get deployment protection bypass token'
      );

      // Verify the mock was called
      expect(mockSpy).toHaveBeenCalled();

      // Restore the mock
      mockSpy.mockRestore();
    });
  });

  describe('telemetry', () => {
    it('tracks path argument with leading slash', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        'test-secret'
      );
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('tracks path argument without leading slash', async () => {
      await setupLinkedProject();

      client.setArgv('curl', 'api/hello', '--protection-bypass', 'test-secret');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'no-slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('tracks deployment option with dpl_ prefix', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ABC123',
        '--protection-bypass',
        'test-secret'
      );

      client.scenario.get('/v13/deployments/dpl_ABC123', (_req, res) => {
        res.json({
          url: 'deployment-abc123.vercel.app',
        });
      });

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:deployment',
          value: 'dpl_',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('tracks deployment option without dpl_ prefix', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'ABC123',
        '--protection-bypass',
        'test-secret'
      );

      // Mock the deployment URL lookup (prefix will be auto-added)
      client.scenario.get('/v13/deployments/dpl_ABC123', (_req, res) => {
        res.json({
          url: 'deployment-abc123.vercel.app',
        });
      });

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:deployment',
          value: 'no-prefix',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('tracks protection-bypass option', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-key'
      );
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('tracks both deployment and protection-bypass options', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        'api/test',
        '--deployment',
        'dpl_XYZ789',
        '--protection-bypass',
        'another-secret'
      );

      // Mock the deployment URL lookup
      client.scenario.get('/v13/deployments/dpl_XYZ789', (_req, res) => {
        res.json({
          url: 'deployment-xyz789.vercel.app',
        });
      });

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:path',
          value: 'no-slash',
        },
        {
          key: 'option:deployment',
          value: 'dpl_',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});

describe('getDeploymentUrlById', () => {
  it('should accept a bare vercel.app host and return https origin', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'should-not-be-used.vercel.app',
      }),
    } as any;

    const result = await getDeploymentUrlById(
      mockClient,
      'my-app-abc123.vercel.app'
    );

    expect(result).toBe('https://my-app-abc123.vercel.app');
    expect(mockClient.fetch).not.toHaveBeenCalled();
  });

  it('should add dpl_ prefix when missing', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-abc123.vercel.app',
      }),
    } as any;

    await getDeploymentUrlById(
      mockClient,
      'ERiL45NJvP8ghWxgbvCM447bmxwV',
      MOCK_ACCOUNT_ID
    );

    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
      { accountId: MOCK_ACCOUNT_ID }
    );
  });

  it('should not add dpl_ prefix when already present', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-abc123.vercel.app',
      }),
    } as any;

    await getDeploymentUrlById(
      mockClient,
      'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
      MOCK_ACCOUNT_ID
    );

    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
      { accountId: MOCK_ACCOUNT_ID }
    );
  });

  it('should return null when deployment is not found', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue(null),
    } as any;

    const result = await getDeploymentUrlById(
      mockClient,
      'ERiL45NJvP8ghWxgbvCM447bmxwV',
      MOCK_ACCOUNT_ID
    );

    expect(result).toBeNull();
  });

  it('should return deployment URL when found', async () => {
    const mockClient = {
      fetch: vi.fn().mockResolvedValue({
        url: 'my-app-xyz789.vercel.app',
      }),
    } as any;

    const result = await getDeploymentUrlById(
      mockClient,
      'XYZ789ABC123',
      MOCK_ACCOUNT_ID
    );

    expect(result).toBe('https://my-app-xyz789.vercel.app');
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/v13/deployments/dpl_XYZ789ABC123',
      { accountId: MOCK_ACCOUNT_ID }
    );
  });
});

describe('getDeploymentUrlAndToken target selection', () => {
  it('uses production target alias when available', async () => {
    const { setupUnitFixture } = await import(
      '../../../helpers/setup-unit-fixture'
    );
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;

    useUser();
    useTeams('team_dummy');
    useProject({
      id: 'static',
      name: 'static-project',
      targets: {
        production: { alias: ['prod-alias.vercel.app'] },
      },
      latestDeployments: [
        {
          url: 'static-project-abc123.vercel.app',
        },
      ],
    } as any);

    const res = await getDeploymentUrlAndToken(client, 'curl', '/api/hello', {
      protectionBypassFlag: 'test-secret',
    });

    expect(typeof res).toBe('object');
    if (typeof res === 'number') {
      throw new Error('expected object result');
    }
    expect(res.fullUrl).toBe('https://prod-alias.vercel.app/api/hello');
  });

  it('falls back to latest deployment url when no production alias', async () => {
    const { setupUnitFixture } = await import(
      '../../../helpers/setup-unit-fixture'
    );
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;

    useUser();
    useTeams('team_dummy');
    useProject({
      id: 'static',
      name: 'static-project',
      latestDeployments: [
        {
          url: 'static-project-abc123.vercel.app',
        },
      ],
    } as any);

    const res = await getDeploymentUrlAndToken(client, 'curl', '/api/hello', {
      protectionBypassFlag: 'test-secret',
    });

    expect(typeof res).toBe('object');
    if (typeof res === 'number') {
      throw new Error('expected object result');
    }
    expect(res.fullUrl).toBe(
      'https://static-project-abc123.vercel.app/api/hello'
    );
  });

  it('throws when no target or latest deployments exist', async () => {
    const { setupUnitFixture } = await import(
      '../../../helpers/setup-unit-fixture'
    );
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;

    useUser();
    useTeams('team_dummy');
    useProject({
      id: 'static',
      name: 'static-project',
      latestDeployments: [],
      targets: {},
    } as any);

    await expect(
      getDeploymentUrlAndToken(client, 'curl', '/api/hello', {
        protectionBypassFlag: 'test-secret',
      })
    ).rejects.toThrow('No deployment URL found for the project');
  });
});
