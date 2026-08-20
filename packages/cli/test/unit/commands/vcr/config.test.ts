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
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:config',
        },
      ]);
    });
  });

  it('makes a repository public with --public true', async () => {
    const seen = mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'true');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.method).toBe('PATCH');
    expect(seen.body).toEqual({ public: true });
    expect(client.stderr.getFullOutput()).toContain(
      'Repository my-app is now public'
    );
  });

  it('makes a repository private with --public false', async () => {
    const seen = mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'false');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.body).toEqual({ public: false });
    expect(client.stderr.getFullOutput()).toContain(
      'Repository my-app is now private'
    );
  });

  it('accepts --public=false', async () => {
    const seen = mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'config', 'my-app', '--public=false');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(seen.body).toEqual({ public: false });
  });

  it('prints the updated repository as JSON with --json', async () => {
    mockUpdateRepository({ expectedPublic: true });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'true', '--json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.repository).toMatchObject({
      name: 'my-app',
      public: true,
    });
  });

  it('tracks subcommand invocation and the public value', async () => {
    mockUpdateRepository({ expectedPublic: false });

    client.setArgv('vcr', 'config', 'my-app', '--public', 'false');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:config',
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
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr config');
  });

  it('errors when no setting is passed', async () => {
    client.setArgv('vcr', 'config', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing a setting to change'
    );
  });

  it('errors when --public is passed without a value', async () => {
    client.setArgv('vcr', 'config', 'my-app', '--public');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('requires argument');
  });

  it('errors on an invalid --public value', async () => {
    client.setArgv('vcr', 'config', 'my-app', '--public', 'banana');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Must be one of: true, false'
    );
  });

  it('errors on an invalid --public value passed with =', async () => {
    client.setArgv('vcr', 'config', 'my-app', '--public=yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Must be one of: true, false'
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
});
