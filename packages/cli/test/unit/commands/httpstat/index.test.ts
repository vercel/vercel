import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import httpstat from '../../../../src/commands/httpstat';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';

let spawnMock: ReturnType<typeof vi.fn>;
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('httpstat', () => {
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
      client.setArgv('httpstat', '--help');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Execute httpstat with automatic deployment URL and protection bypass'
      );
    });
  });

  describe('argument parsing', () => {
    it('should reject when no path is provided', async () => {
      client.setArgv('httpstat');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should reject when only -- is provided without a path', async () => {
      client.setArgv('httpstat', '--', '-H', 'Content-Type: application/json');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires an API path');
    });

    it('should accept / as a valid path', async () => {
      await setupLinkedProject();

      client.setArgv('httpstat', '/', '--protection-bypass', 'test-secret');
      const exitCode = await httpstat(client);

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
      client.setArgv('httpstat', 'https://example.com/api/hello');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must be a relative API path');
    });

    it('should reject when a full http URL is provided as the path', async () => {
      client.setArgv('httpstat', 'http://localhost:3000/');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('must be a relative API path');
    });

    it('should reject unrecognized flags before --', async () => {
      client.setArgv('httpstat', '/api/hello', '--invalid-flag');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('should handle process.argv parsing for httpstat flags after --', () => {
      process.argv = [
        'node',
        'vercel',
        'httpstat',
        '/api/hello',
        '--',
        '-H',
        'Content-Type: application/json',
        '-X',
        'POST',
      ];

      const separatorIndex = process.argv.indexOf('--');
      const httpstatFlags =
        separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];

      expect(httpstatFlags).toEqual([
        '-H',
        'Content-Type: application/json',
        '-X',
        'POST',
      ]);
    });
  });

  describe('--deployment flag', () => {
    it('should accept deployment ID with dpl_ prefix', async () => {
      client.setArgv(
        'httpstat',
        '/api/hello',
        '--deployment',
        'dpl_ERiL45NJvP8ghWxgbvCM447bmxwV'
      );
      const separatorIndex = client.argv.indexOf('--');
      expect(separatorIndex).toBe(-1);
    });

    it('should accept deployment ID without dpl_ prefix', async () => {
      client.setArgv(
        'httpstat',
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

    it('should accept a full deployment URL', async () => {
      await setupLinkedProject();

      client.setArgv(
        'httpstat',
        '/api/hello',
        '--deployment',
        'https://deployment-xyz789.vercel.app',
        '--protection-bypass',
        'test-secret'
      );

      const exitCode = await httpstat(client);

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
        'httpstat',
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
        'httpstat',
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
  });

  describe('telemetry', () => {
    it('tracks path argument with leading slash', async () => {
      await setupLinkedProject();

      client.setArgv(
        'httpstat',
        '/api/hello',
        '--protection-bypass',
        'test-secret'
      );
      const exitCode = await httpstat(client);

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

      client.setArgv(
        'httpstat',
        'api/hello',
        '--protection-bypass',
        'test-secret'
      );
      const exitCode = await httpstat(client);

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
        'httpstat',
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

      const exitCode = await httpstat(client);

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
        'httpstat',
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

      const exitCode = await httpstat(client);

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
  });
});
