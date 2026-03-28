import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import curl from '../../../../src/commands/curl';
import { getDeploymentUrlById } from '../../../../src/commands/curl/deployment-url';
import {
  getDeploymentUrlAndToken,
  parseCurlLikeArgs,
} from '../../../../src/commands/curl/shared';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams, createTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

const MOCK_ACCOUNT_ID = 'team_test123';

let spawnMock: ReturnType<typeof vi.fn>;
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('curl', () => {
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
    vi.clearAllMocks();
  });

  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('curl', '/', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(curl(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('--scope');
      expect(payload.message).toContain('non-interactive');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
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
    it('should reject when no target is provided', async () => {
      client.setArgv('curl');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });

    it('should reject when only -- is provided without a target', async () => {
      client.setArgv(
        'curl',
        '--',
        '--header',
        'Content-Type: application/json'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });

    it('should accept / as a valid path', async () => {
      await setupLinkedProject();

      client.setArgv('curl', '/', '--protection-bypass', 'test-secret');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:url',
          value: 'slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should accept a full https URL as the target', async () => {
      client.setArgv(
        'curl',
        'https://example.com/api/hello',
        '--protection-bypass',
        'test'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining(['--url', 'https://example.com/api/hello']),
        expect.any(Object)
      );
    });

    it('should treat a bare hostname as a full URL', async () => {
      client.setArgv(
        'curl',
        'my-app.vercel.app/api/hello',
        '--protection-bypass',
        'test'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining([
          '--url',
          'https://my-app.vercel.app/api/hello',
        ]),
        expect.any(Object)
      );
    });

    it('should treat a bare hostname without path as a full URL', async () => {
      client.setArgv(
        'curl',
        'my-app.vercel.app',
        '--protection-bypass',
        'test'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining(['--url', 'https://my-app.vercel.app']),
        expect.any(Object)
      );
    });

    it('should accept a full http URL as the target', async () => {
      client.setArgv(
        'curl',
        'http://localhost:3000/api/hello',
        '--protection-bypass',
        'test'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining(['--url', 'http://localhost:3000/api/hello']),
        expect.any(Object)
      );
    });

    it('should pass curl flags through without -- separator', async () => {
      client.setArgv(
        'curl',
        'https://example.com/api/hello',
        '--protection-bypass',
        'test',
        '-X',
        'POST',
        '-H',
        'Content-Type: application/json',
        '-d',
        '{"name":"John"}'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://example.com/api/hello',
          '--header',
          'x-vercel-protection-bypass: test',
          '-X',
          'POST',
          '-H',
          'Content-Type: application/json',
          '-d',
          '{"name":"John"}',
        ],
        expect.any(Object)
      );
    });

    it('should still support -- separator for backwards compat', async () => {
      client.setArgv(
        'curl',
        'https://example.com/api/hello',
        '--protection-bypass',
        'test',
        '--',
        '-X',
        'POST'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://example.com/api/hello',
          '--header',
          'x-vercel-protection-bypass: test',
          '-X',
          'POST',
        ],
        expect.any(Object)
      );
    });

    it('should pass -v (verbose) through to curl, not consume as --version', async () => {
      client.setArgv(
        'curl',
        'https://example.com/',
        '--protection-bypass',
        'test',
        '-v'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://example.com/',
          '--header',
          'x-vercel-protection-bypass: test',
          '-v',
        ],
        expect.any(Object)
      );
    });

    it('should pass -d (data) through to curl, not consume as --debug', async () => {
      client.setArgv(
        'curl',
        'https://example.com/api',
        '--protection-bypass',
        'test',
        '-d',
        '{"key":"value"}'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://example.com/api',
          '--header',
          'x-vercel-protection-bypass: test',
          '-d',
          '{"key":"value"}',
        ],
        expect.any(Object)
      );
    });
  });

  describe('full URL mode', () => {
    it('should proceed without bypass header when project cannot be resolved from URL', async () => {
      client.setArgv('curl', 'https://my-app.vercel.app/api/hello');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        ['--url', 'https://my-app.vercel.app/api/hello'],
        expect.any(Object)
      );
    });

    it('should include protection bypass header when flag is provided', async () => {
      client.setArgv(
        'curl',
        'https://my-app.vercel.app/api/hello',
        '--protection-bypass',
        'my-secret'
      );
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://my-app.vercel.app/api/hello',
          '--header',
          'x-vercel-protection-bypass: my-secret',
        ],
        expect.any(Object)
      );
    });

    it('should include protection bypass from env var', async () => {
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'env-secret';

      client.setArgv('curl', 'https://my-app.vercel.app/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://my-app.vercel.app/api/hello',
          '--header',
          'x-vercel-protection-bypass: env-secret',
        ],
        expect.any(Object)
      );

      delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    });

    it('should track full-url telemetry', async () => {
      client.setArgv(
        'curl',
        'https://my-app.vercel.app/api/hello',
        '--protection-bypass',
        'test-secret'
      );
      await curl(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:url',
          value: 'full-url',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--deployment flag', () => {
    it('should accept deployment ID with dpl_ prefix', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'test-secret'
      );

      client.scenario.get(
        '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        (_req, res) => {
          res.json({ url: 'deployment-abc123.vercel.app' });
        }
      );

      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);
    });

    it('should accept a full deployment URL via --deployment', async () => {
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
          key: 'argument:url',
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
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        'my-secret-token'
      );

      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);
    });

    it('should work with both --deployment and --protection-bypass', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        '--protection-bypass',
        'my-secret-token'
      );

      client.scenario.get(
        '/v13/deployments/dpl_ERiL45NJvP8ghWxgbvCM447bmxwV',
        (_req, res) => {
          res.json({ url: 'deployment-abc123.vercel.app' });
        }
      );

      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);
    });

    it('should handle protection bypass secret with special characters', async () => {
      await setupLinkedProject();

      const secretWithSpecialChars = 'abc123-XYZ_456.789~token';
      client.setArgv(
        'curl',
        '/api/hello',
        '--protection-bypass',
        secretWithSpecialChars
      );

      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining([
          '--header',
          `x-vercel-protection-bypass: ${secretWithSpecialChars}`,
        ]),
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('should handle getOrCreateDeploymentProtectionToken failure gracefully', async () => {
      const { setupUnitFixture } = await import(
        '../../../helpers/setup-unit-fixture'
      );
      const cwd = setupUnitFixture('commands/deploy/static');
      client.cwd = cwd;

      const bypassTokenModule = await import(
        '../../../../src/commands/curl/bypass-token'
      );

      const mockSpy = vi
        .spyOn(bypassTokenModule, 'getOrCreateDeploymentProtectionToken')
        .mockRejectedValue(
          new Error('Failed to create deployment protection bypass token')
        );

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

      client.setArgv('curl', '/api/hello');

      const exitCode = await curl(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'Failed to get deployment protection bypass token'
      );

      expect(mockSpy).toHaveBeenCalled();
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
          key: 'argument:url',
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
          key: 'argument:url',
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
          key: 'argument:url',
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

      client.scenario.get('/v13/deployments/dpl_ABC123', (_req, res) => {
        res.json({
          url: 'deployment-abc123.vercel.app',
        });
      });

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:url',
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
          key: 'argument:url',
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

      client.scenario.get('/v13/deployments/dpl_XYZ789', (_req, res) => {
        res.json({
          url: 'deployment-xyz789.vercel.app',
        });
      });

      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:url',
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

describe('parseCurlLikeArgs', () => {
  it('should parse a full URL as the target', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com/api/hello'],
      'curl'
    );
    expect(result.target).toBe('https://example.com/api/hello');
    expect(result.toolFlags).toEqual([]);
  });

  it('should parse a relative path as the target', () => {
    const result = parseCurlLikeArgs(['curl', '/api/hello'], 'curl');
    expect(result.target).toBe('/api/hello');
    expect(result.toolFlags).toEqual([]);
  });

  it('should parse a bare hostname as the target', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'my-app.vercel.app/api/hello'],
      'curl'
    );
    expect(result.target).toBe('my-app.vercel.app/api/hello');
    expect(result.toolFlags).toEqual([]);
  });

  it('should pass short flags through as tool flags', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com', '-X', 'POST', '-v'],
      'curl'
    );
    expect(result.target).toBe('https://example.com');
    expect(result.toolFlags).toEqual(['-X', 'POST', '-v']);
  });

  it('should pass -d through to curl (not consume as --debug)', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com', '-d', '{"foo":"bar"}'],
      'curl'
    );
    expect(result.target).toBe('https://example.com');
    expect(result.toolFlags).toEqual(['-d', '{"foo":"bar"}']);
  });

  it('should pass -v through to curl (not consume as --version)', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com', '-v'],
      'curl'
    );
    expect(result.target).toBe('https://example.com');
    expect(result.toolFlags).toEqual(['-v']);
  });

  it('should pass -T through to curl (not consume as --team)', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com', '-T', 'file.txt'],
      'curl'
    );
    expect(result.target).toBe('https://example.com');
    expect(result.toolFlags).toEqual(['-T', 'file.txt']);
  });

  it('should extract --deployment flag', () => {
    const result = parseCurlLikeArgs(
      ['curl', '/api/hello', '--deployment', 'dpl_123'],
      'curl'
    );
    expect(result.target).toBe('/api/hello');
    expect(result.deployment).toBe('dpl_123');
    expect(result.toolFlags).toEqual([]);
  });

  it('should extract --protection-bypass flag', () => {
    const result = parseCurlLikeArgs(
      ['curl', '/api/hello', '--protection-bypass', 'my-secret'],
      'curl'
    );
    expect(result.target).toBe('/api/hello');
    expect(result.protectionBypass).toBe('my-secret');
    expect(result.toolFlags).toEqual([]);
  });

  it('should extract --yes flag', () => {
    const result = parseCurlLikeArgs(['curl', '/api/hello', '--yes'], 'curl');
    expect(result.target).toBe('/api/hello');
    expect(result.yes).toBe(true);
  });

  it('should handle --flag=value syntax for vc flags', () => {
    const result = parseCurlLikeArgs(
      ['curl', '/api/hello', '--deployment=dpl_123'],
      'curl'
    );
    expect(result.deployment).toBe('dpl_123');
  });

  it('should strip global long flags', () => {
    const result = parseCurlLikeArgs(
      ['curl', '--debug', '/api/hello', '--scope', 'my-team', '-v'],
      'curl'
    );
    expect(result.target).toBe('/api/hello');
    expect(result.toolFlags).toEqual(['-v']);
  });

  it('should handle -- separator for backwards compat', () => {
    const result = parseCurlLikeArgs(
      ['curl', '/api/hello', '--', '-X', 'POST', '-H', 'Content-Type: json'],
      'curl'
    );
    expect(result.target).toBe('/api/hello');
    expect(result.toolFlags).toEqual([
      '-X',
      'POST',
      '-H',
      'Content-Type: json',
    ]);
  });

  it('should combine flags from before and after --', () => {
    const result = parseCurlLikeArgs(
      ['curl', '/api/hello', '-v', '--', '-X', 'POST'],
      'curl'
    );
    expect(result.target).toBe('/api/hello');
    expect(result.toolFlags).toEqual(['-v', '-X', 'POST']);
  });

  it('should handle vc flags mixed with curl flags', () => {
    const result = parseCurlLikeArgs(
      [
        'curl',
        'https://example.com/api',
        '--protection-bypass',
        'secret',
        '-X',
        'POST',
        '-H',
        'Authorization: Bearer token',
      ],
      'curl'
    );
    expect(result.target).toBe('https://example.com/api');
    expect(result.protectionBypass).toBe('secret');
    expect(result.toolFlags).toEqual([
      '-X',
      'POST',
      '-H',
      'Authorization: Bearer token',
    ]);
  });

  it('should return undefined target when no positional arg given', () => {
    const result = parseCurlLikeArgs(['curl'], 'curl');
    expect(result.target).toBeUndefined();
  });

  it('should handle unknown long flags as pass-through', () => {
    const result = parseCurlLikeArgs(
      ['curl', 'https://example.com', '--compressed', '--silent'],
      'curl'
    );
    expect(result.target).toBe('https://example.com');
    expect(result.toolFlags).toEqual(['--compressed', '--silent']);
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
