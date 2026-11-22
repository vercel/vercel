import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import stripAnsi from 'strip-ansi';
import { describe, it, expect, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env ls', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-ls',
        name: 'vercel-env-ls',
      },
      [
        {
          id: 'env_development_url',
          key: 'DEVELOPMENT_URL',
          value: 'dev.example',
          type: 'encrypted',
          visibility: 'config',
          target: ['development'],
          createdAt: 1557241361455,
        },
        {
          id: 'env_production_secret',
          key: 'PRODUCTION_SECRET',
          value: 'do-not-print-this',
          type: 'sensitive',
          visibility: 'secret',
          target: ['production'],
          createdAt: 1557241361455,
        },
        {
          id: 'env_visibility_secret',
          key: 'VISIBILITY_SECRET',
          value: 'also-do-not-print-this',
          type: 'encrypted',
          visibility: 'secret',
          target: ['preview'],
          createdAt: 1557241361455,
        },
      ]
    );
    const cwd = setupUnitFixture('commands/env/vercel-env-ls');
    client.cwd = cwd;
  });

  describe('invalid argument', () => {
    it('errors', async () => {
      client.setArgv('target', 'ls', 'preview', 'branch-name', 'balderdash');
      const exitCode = await env(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  it('tracks `ls` subcommand', async () => {
    client.setArgv('env', 'ls');
    await env(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:ls',
        value: 'ls',
      },
    ]);
  });

  it('shows Config values and identifies Secrets', async () => {
    client.setArgv('env', 'ls');

    const exitCode = await env(client);

    expect(exitCode).toEqual(0);
    const tableOutput = stripAnsi(client.stdout.getFullOutput());
    expect(tableOutput).toMatch(/name\s+value\s+type\s+environments/);
    expect(tableOutput).toMatch(
      /DEVELOPMENT_URL\s+dev\.example\s+Config\s+Development/
    );
    expect(tableOutput).toMatch(
      /PRODUCTION_SECRET\s+Hidden\s+Secret\s+Production/
    );
    expect(tableOutput).toMatch(
      /VISIBILITY_SECRET\s+Hidden\s+Secret\s+Preview/
    );
    expect(tableOutput).not.toContain('do-not-print-this');
    expect(tableOutput).not.toContain('also-do-not-print-this');
    expect(tableOutput).not.toContain('Encrypted');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('--guidance', () => {
    it('retains linked-project guidance and tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--guidance');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        { key: 'flag:guidance', value: 'TRUE' },
      ]);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        [
          'Next steps:',
          '- Add an Environment Variable:',
          '  vercel env add',
          '- Remove an Environment Variable:',
          '  vercel env remove',
          '- Pull Development Environment Variables into .env.local:',
          '  vercel env pull',
        ].join('\n')
      );
    });
  });

  describe('[environment]', () => {
    it('tracks `environment` argument', async () => {
      client.setArgv('env', 'ls', 'production');
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'argument:environment',
          value: 'production',
        },
      ]);
    });

    it('tracks redacted `environment` argument', async () => {
      client.setArgv('env', 'ls', 'custom-env');
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'argument:environment',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('[git-branch]', () => {
      it('tracks `git-branch` argument', async () => {
        client.setArgv('env', 'ls', 'production', 'main');
        await env(client);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:ls',
            value: 'ls',
          },
          {
            key: 'argument:environment',
            value: 'production',
          },
          {
            key: 'argument:git-branch',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });

  describe('--environment and --git-branch', () => {
    it.each([
      ['--environment', 'production'],
      ['-e', 'production'],
      ['--environment=production'],
    ])('lists only the variables for the environment given with %s', async (...args) => {
      client.setArgv('env', 'ls', ...args, '--json');
      await expect(env(client)).resolves.toEqual(0);
      const { envs } = JSON.parse(client.stdout.getFullOutput());
      expect(envs.map((env: { key: string }) => env.key)).toEqual([
        'PRODUCTION_SECRET',
      ]);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it('keeps the environment and Git branch arguments working with deprecation warnings', async () => {
      client.setArgv('env', 'ls', 'production', 'main');
      await expect(env(client)).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'The environment argument is deprecated. Use --environment.'
      );
      expect(stderr).toContain(
        'The Git branch argument is deprecated. Use --git-branch.'
      );
    });

    it('rejects an environment given both ways', async () => {
      client.setArgv('env', 'ls', 'preview', '--environment', 'production');
      await expect(env(client)).resolves.toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use an environment argument with --environment."
      );
    });

    it('reports an environment given both ways as JSON in non-interactive mode', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      client.nonInteractive = true;
      client.setArgv('env', 'ls', 'preview', '--environment', 'production');

      await expect(env(client)).rejects.toThrow('exit');
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
      });

      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('rejects a Git branch given both ways', async () => {
      client.setArgv('env', 'ls', 'preview', 'main', '--git-branch', 'main');
      await expect(env(client)).resolves.toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use a Git branch argument with --git-branch."
      );
    });

    it('tracks --environment and --git-branch as options', async () => {
      client.setArgv(
        'env',
        'ls',
        '--environment',
        'production',
        '--git-branch',
        'main'
      );
      await env(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:environment', value: 'production' },
        { key: 'option:git-branch', value: '[REDACTED]' },
      ]);
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('returns error for invalid --format value', async () => {
      client.setArgv('env', 'ls', '--format', 'xml');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid output format: "xml"');
    });

    it('outputs environment variables as JSON with correct structure', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      // Verify JSON structure
      expect(jsonOutput).toHaveProperty('envs');
      expect(Array.isArray(jsonOutput.envs)).toBe(true);
      expect(jsonOutput.envs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'DEVELOPMENT_URL',
            value: 'dev.example',
            type: 'encrypted',
            visibility: 'config',
          }),
        ])
      );
      const sensitiveVariable = jsonOutput.envs.find(
        (item: { key: string }) => item.key === 'PRODUCTION_SECRET'
      );
      expect(sensitiveVariable).toMatchObject({
        type: 'sensitive',
        visibility: 'secret',
      });
      expect(sensitiveVariable).not.toHaveProperty('value');
      const visibilitySecret = jsonOutput.envs.find(
        (item: { key: string }) => item.key === 'VISIBILITY_SECRET'
      );
      expect(visibilitySecret).toMatchObject({
        type: 'encrypted',
        visibility: 'secret',
      });
      expect(visibilitySecret).not.toHaveProperty('value');
      expect(output).not.toContain('do-not-print-this');
      expect(output).not.toContain('also-do-not-print-this');
    });

    it('does not output table headers when using JSON format', async () => {
      client.setArgv('env', 'ls', '--format', 'json');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.getFullOutput();
      // Should not contain table formatting
      expect(stderrOutput).not.toContain('environments');
      expect(stderrOutput).not.toContain('created');
    });
  });

  describe('--project', () => {
    it('lists variables from an unlinked directory without writing link metadata', async () => {
      const cwd = setupTmpDir('env-ls-explicit-project');
      client.cwd = cwd;
      useProject(
        {
          ...defaultProject,
          id: 'prj_explicit',
          name: 'explicit-project',
          accountId: 'team_dummy',
        },
        []
      );

      client.setArgv(
        'env',
        'ls',
        '--project',
        'explicit-project',
        '--format',
        'json'
      );
      const exitCode = await env(client);

      expect(exitCode).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({ envs: [] });
      expect(existsSync(join(cwd, '.vercel'))).toBe(false);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:format', value: 'json' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });

    it('preserves the explicitly selected project in guidance', async () => {
      const cwd = setupTmpDir('env-ls-project-guidance');
      client.cwd = cwd;
      useProject({
        ...defaultProject,
        id: 'prj_guidance',
        name: 'guidance-project',
        accountId: 'team_dummy',
      });

      client.setArgv(
        'env',
        'ls',
        '--project',
        'guidance-project',
        '--guidance'
      );
      const exitCode = await env(client);

      expect(exitCode).toEqual(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        '- Add an Environment Variable:\n  vercel env add --project guidance-project'
      );
      expect(output).toContain(
        '- Remove an Environment Variable:\n  vercel env remove --project guidance-project'
      );
      expect(output).toContain(
        '- Pull Development Environment Variables into .env.local:\n  vercel env pull --project guidance-project'
      );
    });

    it('reports an unknown explicit project instead of linking', async () => {
      const cwd = setupTmpDir('env-ls-unknown-project');
      client.cwd = cwd;
      useUnknownProject();

      client.setArgv('env', 'ls', '--project', 'does-not-exist');
      const exitCode = await env(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Project "does-not-exist" was not found'
      );
      expect(existsSync(join(cwd, '.vercel'))).toBe(false);
    });
  });
});

describe('env ls in a linked folder', () => {
  const linkedProject = {
    ...defaultProject,
    id: 'vercel-env-ls',
    name: 'vercel-env-ls',
  };
  const linkedEnv = {
    id: 'env_development_url',
    key: 'DEVELOPMENT_URL',
    value: 'dev.example',
    type: 'encrypted' as const,
    visibility: 'config' as const,
    target: ['development' as const],
    createdAt: 1557241361455,
  };

  interface EnvRequest {
    path: string;
    query: Record<string, unknown>;
  }

  // Registered before `useProject()`, so they see every env and custom
  // environments request and then pass it on (or answer it themselves).
  // Returns the requests in the order they arrived.
  function recordEnvRequests(
    respond?: (
      request: EnvRequest,
      res: {
        set(field: string, value: string): unknown;
        status(code: number): unknown;
        json(body: unknown): void;
      }
    ) => boolean
  ) {
    const requests: EnvRequest[] = [];
    for (const path of [
      '/v10/projects/:projectId/env',
      '/projects/:projectId/custom-environments',
    ]) {
      client.scenario.get(path, (req, res, next) => {
        const request = { path: req.path, query: { ...req.query } };
        requests.push(request);
        if (!respond?.(request, res)) {
          next?.();
        }
      });
    }
    return requests;
  }

  const byPath = (a: EnvRequest, b: EnvRequest) => a.path.localeCompare(b.path);

  // The two requests `env ls` sends for the linked project, sorted by path.
  function linkedRequests(query: Record<string, unknown>, teamId?: string) {
    const team = teamId ? { teamId } : {};
    return [
      { path: '/projects/vercel-env-ls/custom-environments', query: team },
      { path: '/v10/projects/vercel-env-ls/env', query: { ...query, ...team } },
    ];
  }

  let user: ReturnType<typeof useUser>;

  beforeEach(() => {
    user = useUser();
    useTeams('team_dummy');
    client.cwd = setupUnitFixture('commands/env/vercel-env-ls');
  });

  it('sends the env requests before the project lookup returns', async () => {
    let seen = 0;
    let bothSent = () => {};
    const sent = new Promise<boolean>(resolve => {
      bothSent = () => resolve(true);
      setTimeout(() => resolve(false), 1000);
    });
    let sentBeforeProjectReturned = false;
    // Runs before the `useProject()` handler and holds the project response
    // until both env requests arrive (or a second has passed).
    client.scenario.get(
      '/:version/projects/vercel-env-ls',
      async (_req, _res, next) => {
        sentBeforeProjectReturned = await sent;
        next?.();
      }
    );
    const requests = recordEnvRequests(() => {
      if (++seen === 2) bothSent();
      return false;
    });
    useProject(linkedProject, [linkedEnv]);
    client.setArgv('env', 'ls');

    await expect(env(client)).resolves.toBe(0);
    expect(sentBeforeProjectReturned).toBe(true);
    expect(requests.sort(byPath)).toEqual(
      linkedRequests({ source: 'vercel-cli:env:ls' }, 'team_dummy')
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Environment Variables found for'
    );
    expect(stripAnsi(client.stdout.getFullOutput())).toMatch(
      /DEVELOPMENT_URL\s+dev\.example\s+Config\s+Development/
    );
  });

  it("scopes the early requests to the link's team, not the current team", async () => {
    const requests = recordEnvRequests();
    useProject(linkedProject, [linkedEnv]);
    client.config.currentTeam = 'team_other';
    client.setArgv('env', 'ls', '--format', 'json');

    await expect(env(client)).resolves.toBe(0);
    expect(requests.map(request => request.query.teamId)).toEqual([
      'team_dummy',
      'team_dummy',
    ]);
  });

  it('sends no team for a project owned by a personal account', async () => {
    const cwd = setupTmpDir('env-ls-personal');
    mkdirSync(join(cwd, '.vercel'));
    writeFileSync(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ orgId: user.id, projectId: 'vercel-env-ls' })
    );
    client.cwd = cwd;
    const requests = recordEnvRequests();
    useProject({ ...linkedProject, accountId: user.id }, [linkedEnv]);
    client.setArgv('env', 'ls', '--format', 'json');

    await expect(env(client)).resolves.toBe(0);
    expect(requests.sort(byPath)).toEqual(
      linkedRequests({ source: 'vercel-cli:env:ls' })
    );
    expect(JSON.parse(client.stdout.getFullOutput()).envs).toHaveLength(1);
  });

  it.each([
    [['production', 'main'], { target: 'production', gitBranch: 'main' }],
    [
      ['--environment', 'preview', '--git-branch', 'feature'],
      { target: 'preview', gitBranch: 'feature' },
    ],
    [['--environment', 'staging'], { customEnvironmentId: 'staging' }],
  ])('sends the environment and Git branch of %j with the early request', async (args, query) => {
    const requests = recordEnvRequests();
    useProject(linkedProject, [linkedEnv]);
    client.setArgv('env', 'ls', ...args);

    await expect(env(client)).resolves.toBe(0);
    expect(requests.sort(byPath)).toEqual(
      linkedRequests({ ...query, source: 'vercel-cli:env:ls' }, 'team_dummy')
    );
  });

  it('sends the requests for --project after the lookup, as before', async () => {
    const requests = recordEnvRequests();
    useProject(linkedProject, [linkedEnv]);
    useProject(
      {
        ...defaultProject,
        id: 'prj_explicit',
        name: 'explicit-project',
        accountId: 'team_dummy',
      },
      []
    );
    client.setArgv('env', 'ls', '--project', 'explicit-project');

    await expect(env(client)).resolves.toBe(0);
    expect(requests.sort(byPath)).toEqual([
      {
        path: '/projects/prj_explicit/custom-environments',
        query: { teamId: 'team_dummy' },
      },
      {
        path: '/v10/projects/prj_explicit/env',
        query: { source: 'vercel-cli:env:ls', teamId: 'team_dummy' },
      },
    ]);
  });

  it('sends the usual requests at once when the early env request is rate limited', async () => {
    const envRequests = () => requests.filter(r => r.path.endsWith('/env'));
    const requests = recordEnvRequests((request, res) => {
      if (!request.path.endsWith('/env') || envRequests().length > 1) {
        return false;
      }
      // The real client waits at least 60 seconds to retry this one.
      res.set('Retry-After', '60');
      res.status(429);
      res.json({
        error: { code: 'rate_limited', message: 'Too many requests' },
      });
      return true;
    });
    useProject(linkedProject, [linkedEnv]);
    client.setArgv('env', 'ls');

    await expect(env(client)).resolves.toBe(0);
    const query = { source: 'vercel-cli:env:ls', teamId: 'team_dummy' };
    expect(envRequests().map(r => r.query)).toEqual([query, query]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Environment Variables found for');
    expect(stderr).not.toContain('Too many requests');
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'DEVELOPMENT_URL'
    );
  });

  it('throws the same error as before when the env request fails', async () => {
    recordEnvRequests((request, res) => {
      if (!request.path.endsWith('/env')) return false;
      res.status(403);
      res.json({ error: { code: 'forbidden', message: 'Not allowed' } });
      return true;
    });
    useProject(linkedProject, [linkedEnv]);
    client.setArgv('env', 'ls');

    await expect(env(client)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'Not allowed (403)',
    });
  });

  it('warns and exits 1 when the linked project is gone', async () => {
    useUnknownProject();
    const requests = recordEnvRequests((_request, res) => {
      // The early requests for the stale project: never shown.
      res.status(404);
      res.json({ error: { code: 'not_found', message: 'early request' } });
      return true;
    });
    client.setArgv('env', 'ls');

    await expect(env(client)).resolves.toBe(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore.'
    );
    expect(stderr).toContain(
      'Your codebase isn’t linked to a project on Vercel.'
    );
    expect(stderr).not.toContain('early request');
    expect(requests.length).toBeLessThanOrEqual(2);
  });

  it('exits 1 when VERCEL_ORG_ID and VERCEL_PROJECT_ID name a missing project', async () => {
    useUnknownProject();
    const requests = recordEnvRequests((_request, res) => {
      res.status(404);
      res.json({ error: { code: 'not_found', message: 'early request' } });
      return true;
    });
    client.cwd = setupTmpDir();
    client.setArgv('env', 'ls');

    process.env.VERCEL_ORG_ID = 'team_dummy';
    process.env.VERCEL_PROJECT_ID = 'prj_missing';
    try {
      await expect(env(client)).resolves.toBe(1);
    } finally {
      delete process.env.VERCEL_ORG_ID;
      delete process.env.VERCEL_PROJECT_ID;
    }
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Project not found ({"VERCEL_PROJECT_ID":"prj_missing","VERCEL_ORG_ID":"team_dummy"})'
    );
    expect(stderr).not.toContain('Environment Variables found');
    // At most the early requests, which are discarded.
    expect(requests.every(r => r.path.includes('prj_missing'))).toBe(true);
  });

  it.each([
    [{ code: 'forbidden', message: 'Not allowed' }, 'PROJECT_UNAUTHORIZED'],
    [
      { code: 'team_unauthorized', message: 'Not allowed' },
      'PROJECT_UNAUTHORIZED',
    ],
    [
      { code: 'forbidden', invalidToken: true, message: 'Bad token' },
      'NOT_AUTHORIZED',
    ],
  ])('throws the same error as before for a 403 project lookup (%j)', async (error, code) => {
    client.scenario.get('/:version/projects/vercel-env-ls', (_req, res) => {
      res.status(403).json({ error });
    });
    recordEnvRequests();
    useProject(linkedProject, [linkedEnv]);
    client.setArgv('env', 'ls');

    await expect(env(client)).rejects.toMatchObject({ code });
    expect(client.stderr.getFullOutput()).not.toContain(
      'Environment Variables found'
    );
  });
});
