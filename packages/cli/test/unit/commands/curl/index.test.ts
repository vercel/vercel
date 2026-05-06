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
import assert from 'assert';

const MOCK_ACCOUNT_ID = 'team_test123';
const OIDC_HEADER = 'x-vercel-trusted-oidc-idp-token';
const BYPASS_HEADER = 'x-vercel-protection-bypass';

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
    useProject(
      {
        id: 'static',
        name: 'static-project',
        latestDeployments: [
          {
            url: 'static-project-abc123.vercel.app',
          },
        ],
      } as any,
      [
        {
          type: 'plain',
          id: 'oidc-token',
          key: 'VERCEL_OIDC_TOKEN',
          value: 'oidc-token',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        } as any,
      ]
    );
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
        'Execute curl against Vercel deployments with automatic auth'
      );
    });
  });

  describe('argument parsing', () => {
    it('should reject when no URL or path is provided', async () => {
      client.setArgv('curl');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires a URL or API path');
    });

    it('should reject when only -- is provided without a URL or path', async () => {
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
          key: 'argument:path',
          value: 'slash',
        },
        {
          key: 'option:protection-bypass',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should accept a full https URL as the target', async () => {
      await setupLinkedProject();
      client.scenario.get(
        '/v13/deployments/static-project-abc123.vercel.app',
        (_req, res) => {
          res.json({ projectId: 'static', ownerId: 'team_dummy' });
        }
      );

      client.setArgv(
        'curl',
        'https://static-project-abc123.vercel.app/api/hello'
      );
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://static-project-abc123.vercel.app/api/hello',
          '--header',
          `${OIDC_HEADER}: oidc-token`,
        ],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
    });

    it('should not send linked project OIDC token to unresolved full URLs', async () => {
      await setupLinkedProject();

      client.setArgv('curl', 'http://localhost:3000/');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        ['--url', 'http://localhost:3000/'],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
    });

    it('should pass through unrecognized curl flags without --', async () => {
      await setupLinkedProject();

      client.setArgv('curl', '/api/hello', '--invalid-flag');
      const exitCode = await curl(client);
      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining(['--invalid-flag']),
        expect.anything()
      );
    });

    it('should pass all args after the target through without requiring --', () => {
      expect(
        parseCurlLikeArgs(
          [
            'curl',
            '/api/hello',
            '-X',
            'POST',
            '-H',
            'Content-Type: application/json',
            '-d',
            '{"name":"John"}',
            '-T',
            'file.txt',
            '--help',
          ],
          'curl'
        )
      ).toEqual({
        target: '/api/hello',
        deployment: undefined,
        protectionBypass: undefined,
        yes: false,
        help: false,
        toolFlags: [
          '-X',
          'POST',
          '-H',
          'Content-Type: application/json',
          '-d',
          '{"name":"John"}',
          '-T',
          'file.txt',
          '--help',
        ],
      });
    });

    it('should not try to parse curl flags before the target', () => {
      expect(
        parseCurlLikeArgs(
          ['curl', '-X', 'POST', 'https://example.com/api/hello'],
          'curl'
        )
      ).toMatchObject({
        target: 'POST',
        toolFlags: ['-X', 'https://example.com/api/hello'],
      });
    });

    it('should treat curl --url as the target', () => {
      expect(
        parseCurlLikeArgs(
          ['curl', '--url', 'https://example.com/api/hello', '-X', 'POST'],
          'curl'
        )
      ).toMatchObject({
        target: 'https://example.com/api/hello',
        toolFlags: ['-X', 'POST'],
      });
    });

    it('should ignore Vercel globals before the command and pass short flags after the target to curl', () => {
      expect(
        parseCurlLikeArgs(
          ['--debug', '--scope', 'team_slug', 'curl', '/api/hello', '-v'],
          'curl'
        )
      ).toMatchObject({
        target: '/api/hello',
        toolFlags: ['-v'],
      });
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

    it('should use an explicit protection bypass secret as a fallback header', async () => {
      await setupLinkedProject();

      client.setArgv(
        'curl',
        'https://static-project-abc123.vercel.app/api/hello',
        '--protection-bypass',
        'manual-secret'
      );
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://static-project-abc123.vercel.app/api/hello',
          '--header',
          `${BYPASS_HEADER}: manual-secret`,
        ],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
    });
  });

  describe('full URL auth resolution', () => {
    it('should resolve aliases across teams and use the alias project OIDC token', async () => {
      useUser();
      const teams = useTeams('team_one');
      assert(Array.isArray(teams));
      const teamA = teams[0];
      const teamB = createTeam('team_two');
      client.scenario.get('/now/aliases/custom.example.com', (req, res) => {
        if (req.query.teamId === teamA.id) {
          return res.status(404).json({ error: { message: 'not found' } });
        }
        if (req.query.teamId === teamB.id) {
          return res.json({ projectId: 'alias-project', ownerId: teamB.id });
        }
        return res.status(404).json({ error: { message: 'not found' } });
      });
      useProject({ id: 'alias-project', name: 'alias-project' } as any, [
        {
          type: 'plain',
          id: 'alias-oidc-token',
          key: 'VERCEL_OIDC_TOKEN',
          value: 'alias-oidc-token',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        } as any,
      ]);

      client.setArgv('curl', 'https://custom.example.com/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://custom.example.com/api/hello',
          '--header',
          `${OIDC_HEADER}: alias-oidc-token`,
        ],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
    });

    it('should skip limited teams when resolving aliases across teams', async () => {
      useUser();
      const teams = useTeams('team_one');
      assert(Array.isArray(teams));
      const teamA = teams[0];
      const teamB = createTeam('team_two');
      const teamC = createTeam('team_three', 'team-three');
      (teamC as typeof teamC & { limited?: boolean }).limited = true;

      const queriedTeamIds: (string | undefined)[] = [];
      client.scenario.get('/now/aliases/limited.example.com', (req, res) => {
        const teamId = req.query.teamId as string | undefined;
        queriedTeamIds.push(teamId);

        if (teamId === teamA.id) {
          return res.status(404).json({ error: { message: 'not found' } });
        }
        if (teamId === teamB.id) {
          return res.json({ projectId: 'alias-project', ownerId: teamB.id });
        }
        if (teamId === teamC.id) {
          return res.status(403).json({ error: { message: 'saml required' } });
        }
        return res.status(404).json({ error: { message: 'not found' } });
      });
      useProject({ id: 'alias-project', name: 'alias-project' } as any, [
        {
          type: 'plain',
          id: 'alias-oidc-token',
          key: 'VERCEL_OIDC_TOKEN',
          value: 'alias-oidc-token',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        } as any,
      ]);

      client.setArgv('curl', 'https://limited.example.com/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(queriedTeamIds).toContain(teamA.id);
      expect(queriedTeamIds).toContain(teamB.id);
      expect(queriedTeamIds).not.toContain(teamC.id);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://limited.example.com/api/hello',
          '--header',
          `${OIDC_HEADER}: alias-oidc-token`,
        ],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
    });

    it('should retry alias lookup with a selected limited team', async () => {
      useUser();
      const teams = useTeams('team_one');
      assert(Array.isArray(teams));
      const teamA = teams[0];
      const teamB = createTeam('team_two', 'team-two');
      (teamB as typeof teamB & { limited?: boolean }).limited = true;

      const queriedTeamIds: (string | undefined)[] = [];
      client.scenario.get('/now/aliases/retry.example.com', (req, res) => {
        const teamId = req.query.teamId as string | undefined;
        queriedTeamIds.push(teamId);

        if (teamId === teamA.id) {
          return res.status(404).json({ error: { message: 'not found' } });
        }
        if (teamId === teamB.id) {
          return res.json({ projectId: 'alias-project', ownerId: teamB.id });
        }
        return res.status(404).json({ error: { message: 'not found' } });
      });
      useProject({ id: 'alias-project', name: 'alias-project' } as any, [
        {
          type: 'plain',
          id: 'alias-oidc-token',
          key: 'VERCEL_OIDC_TOKEN',
          value: 'alias-oidc-token',
          target: ['development'],
          gitBranch: null,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        } as any,
      ]);

      const selectSpy = vi
        .spyOn(client.input, 'select')
        .mockResolvedValue(teamB as never);
      const reauthSpy = vi
        .spyOn(client, 'reauthenticate')
        .mockResolvedValue(undefined);

      client.setArgv('curl', 'https://retry.example.com/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(selectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which team should Vercel use to resolve this URL?',
        })
      );
      expect(reauthSpy).toHaveBeenCalledWith({
        teamId: teamB.id,
        scope: teamB.slug,
        enforced: false,
      });
      expect(queriedTeamIds).toEqual([teamA.id, teamB.id]);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        [
          '--url',
          'https://retry.example.com/api/hello',
          '--header',
          `${OIDC_HEADER}: alias-oidc-token`,
        ],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );

      selectSpy.mockRestore();
      reauthSpy.mockRestore();
    });

    it('should not prompt for limited team retry in non-interactive mode', async () => {
      useUser();
      const teams = useTeams('team_one');
      assert(Array.isArray(teams));
      const teamA = teams[0];
      const teamB = createTeam('team_two', 'team-two');
      (teamB as typeof teamB & { limited?: boolean }).limited = true;

      const queriedTeamIds: (string | undefined)[] = [];
      client.scenario.get('/now/aliases/plain.example.com', (req, res) => {
        queriedTeamIds.push(req.query.teamId as string | undefined);
        return res.status(404).json({ error: { message: 'not found' } });
      });

      const selectSpy = vi.spyOn(client.input, 'select');
      const reauthSpy = vi.spyOn(client, 'reauthenticate');

      client.setArgv('curl', 'https://plain.example.com/api/hello');
      (client as { nonInteractive: boolean }).nonInteractive = true;
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(queriedTeamIds).toEqual([teamA.id]);
      expect(queriedTeamIds).not.toContain(teamB.id);
      expect(selectSpy).not.toHaveBeenCalled();
      expect(reauthSpy).not.toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        ['--url', 'https://plain.example.com/api/hello'],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );

      (client as { nonInteractive: boolean }).nonInteractive = false;
      selectSpy.mockRestore();
      reauthSpy.mockRestore();
    });

    it('should add https:// to bare host targets', async () => {
      await setupLinkedProject();

      client.setArgv('curl', 'static-project-abc123.vercel.app/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toEqual(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining([
          '--url',
          'https://static-project-abc123.vercel.app/api/hello',
        ]),
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should continue without an auth header when OIDC token pull is unavailable', async () => {
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

      client.setArgv('curl', '/api/hello');
      const exitCode = await curl(client);

      expect(exitCode).toBe(0);
      expect(spawnMock).toHaveBeenCalledWith(
        'curl',
        ['--url', 'https://static-project-abc123.vercel.app/api/hello'],
        expect.objectContaining({ stdio: 'inherit', shell: false })
      );
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
