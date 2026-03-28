import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import httpstat from '../../../../src/commands/httpstat';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams, createTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

let spawnMock: ReturnType<typeof vi.fn>;
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('httpstat', () => {
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
      client.setArgv('httpstat', '/', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(httpstat(client)).rejects.toThrow('process.exit(1)');

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
      client.setArgv('httpstat', '--help');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Execute httpstat with automatic deployment URL and protection bypass'
      );
    });
  });

  describe('argument parsing', () => {
    it('should reject when no target is provided', async () => {
      client.setArgv('httpstat');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });

    it('should reject when only -- is provided without a target', async () => {
      client.setArgv('httpstat', '--', '-H', 'Content-Type: application/json');
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });

    it('should accept / as a valid path', async () => {
      await setupLinkedProject();

      client.setArgv('httpstat', '/', '--protection-bypass', 'test-secret');
      const exitCode = await httpstat(client);

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
        'httpstat',
        'https://example.com/api/hello',
        '--protection-bypass',
        'test'
      );
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'httpstat',
        expect.arrayContaining(['https://example.com/api/hello']),
        expect.any(Object)
      );
    });

    it('should pass httpstat flags through without -- separator', async () => {
      client.setArgv(
        'httpstat',
        'https://example.com/api/hello',
        '--protection-bypass',
        'test',
        '-X',
        'POST',
        '-H',
        'Content-Type: application/json'
      );
      const exitCode = await httpstat(client);
      expect(exitCode).toEqual(0);

      expect(spawnMock).toHaveBeenCalledWith(
        'httpstat',
        [
          'https://example.com/api/hello',
          '-H',
          'x-vercel-protection-bypass: test',
          '-X',
          'POST',
          '-H',
          'Content-Type: application/json',
        ],
        expect.any(Object)
      );
    });
  });

  describe('--deployment flag', () => {
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
  });
});
