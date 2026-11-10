import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import vcr from '../../../../src/commands/vcr';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

let tmpDir: string;

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_vcr',
      name: 'vcr-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

function mockUpdateRepository(opts: { expectedPublic: boolean }) {
  const seen = { method: '', body: undefined as unknown };
  client.scenario.patch('/v1/vcr/repository/my-app', (req, res) => {
    seen.method = req.method;
    seen.body = req.body;
    expect(req.query.projectId).toBe('prj_vcr');
    res.json({
      repository: {
        id: 'repo_1',
        projectId: 'prj_vcr',
        name: 'my-app',
        public: opts.expectedPublic,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });
  return seen;
}

describe('vcr config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-config');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'config', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:config',
        },
      ]);
    });
  });

  it('makes a repository public with --public', async () => {
    const seen = mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'update', 'my-app', '--public');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.method).toBe('PATCH');
    expect(seen.body).toEqual({ public: true });
    expect(client.stderr.getFullOutput()).toContain(
      'Repository my-app is now public'
    );
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('makes a repository private with --no-public', async () => {
    const seen = mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'update', 'my-app', '--no-public');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.body).toEqual({ public: false });
    expect(client.stderr.getFullOutput()).toContain(
      'Repository my-app is now private'
    );
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('accepts --public before the repository', async () => {
    const seen = mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'update', '--public', 'my-app');
    expect(await vcr(client)).toBe(0);
    expect(seen.body).toEqual({ public: true });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('still accepts --public %s, with a warning', async (value, expected) => {
    const seen = mockUpdateRepository({ expectedPublic: expected });

    client.setArgv('vcr', 'update', 'my-app', '--public', value);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.body).toEqual({ public: expected });
    expect(client.stderr.getFullOutput()).toContain(
      `--public ${value} is deprecated. Use ${expected ? '--public' : '--no-public'}.`
    );
  });

  it.each([
    ['--public=true', true],
    ['--public=false', false],
  ])('accepts %s without a warning', async (flag, expected) => {
    const seen = mockUpdateRepository({ expectedPublic: expected });

    client.setArgv('vcr', 'update', 'my-app', flag);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.body).toEqual({ public: expected });
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('prints the updated repository as JSON with --json', async () => {
    mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'update', 'my-app', '--public', '--json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.repository).toMatchObject({
      name: 'my-app',
      public: true,
    });
  });

  it('keeps stderr clean for the old --public true with --json', async () => {
    mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'update', 'my-app', '--public', 'true', '--json');
    expect(await vcr(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).repository.public).toBe(
      true
    );
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('tracks --public and --no-public as flags', async () => {
    mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'update', 'my-app', '--no-public');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'flag:no-public',
        value: 'TRUE',
      },
    ]);
  });

  it('tracks the old --public value', async () => {
    mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'false');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'config',
      },
      {
        key: 'option:public',
        value: 'false',
      },
    ]);
  });

  it('errors when the repository argument is missing', async () => {
    client.setArgv('vcr', 'config', '--public', 'true');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('vcr config');
  });

  it('errors when no setting is passed', async () => {
    client.setArgv('vcr', 'config', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing a setting to change'
    );
  });

  it('errors on --public with --no-public', async () => {
    client.setArgv('vcr', 'update', 'my-app', '--public', '--no-public');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --public with --no-public."
    );
  });

  it.each([
    ['--public', 'yes'],
    ['--public=yes'],
  ])('errors on an invalid value: %s %s', async (...flag) => {
    client.setArgv('vcr', 'update', 'my-app', ...flag);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "--public doesn't take a value. Use --public or --no-public."
    );
  });

  it.each([
    [['--json']],
    [['--format', 'json']],
  ])('reports an invalid value as a JSON error with %j', async jsonFlags => {
    client.setArgv('vcr', 'update', 'my-app', '--public=yes', ...jsonFlags);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'INVALID_ARGUMENTS',
        message: "--public doesn't take a value. Use --public or --no-public.",
      },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('errors instead of ignoring a value that looks like a second argument', async () => {
    client.setArgv('vcr', 'update', 'my-app', '--public', 'banana');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`vcr update` takes one repository.'
    );
  });

  it('surfaces API errors', async () => {
    client.scenario.patch('/v1/vcr/repository/my-app', (_req, res) => {
      res.status(404).json({
        error: { code: 'not_found', message: 'Repository not found.' },
      });
    });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'true');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Repository not found');
  });

  describe('subcommand name', () => {
    it('warns when invoked as the deprecated config name', async () => {
      mockUpdateRepository({ expectedPublic: true });
      client.setArgv('vcr', 'config', 'my-app', '--public', 'true');

      expect(await vcr(client)).toBe(0);
      await expect(client.stderr).toOutput(
        '`vercel vcr config` is deprecated. Use `vercel vcr update`.'
      );
    });

    it('does not warn when invoked as update', async () => {
      mockUpdateRepository({ expectedPublic: true });
      client.setArgv('vcr', 'update', 'my-app', '--public');

      expect(await vcr(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });
  });
});
