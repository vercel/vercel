import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import vcr from '../../../../src/commands/vcr';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as getProjectModule from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProject = vi.mocked(getProjectModule.default);

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

function mockNotLinked() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'not_linked',
    org: null,
    project: null,
  } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

describe('vcr ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-ls');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'ls', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:ls',
        },
      ]);
    });
  });

  it('lists repositories for the linked project', async () => {
    client.scenario.get('/v1/vcr/repository', (req, res) => {
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_vcr');
      res.json({
        repositories: [
          {
            id: 'repo_1',
            projectId: 'prj_vcr',
            name: 'my-app',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    });

    client.setArgv('vcr', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('my-app');
    expect(out).toContain('repo_1');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.get('/v1/vcr/repository', (_req, res) => {
      res.json({ repositories: [] });
    });

    client.setArgv('vcr', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:ls',
        value: 'ls',
      },
    ]);
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.get('/v1/vcr/repository', (_req, res) => {
      res.json({ repositories: [{ id: 'repo_1', name: 'my-app' }] });
    });

    client.setArgv('vcr', 'ls', '--format', 'json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.repositories[0].id).toBe('repo_1');
  });

  it('resolves --project via the current team scope', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_other' } as any);
    let seenProjectId = '';
    client.scenario.get('/v1/vcr/repository', (req, res) => {
      seenProjectId = String(req.query.projectId);
      res.json({ repositories: [] });
    });

    client.setArgv('vcr', 'ls', '--project', 'other-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-app',
      'team_dummy'
    );
    expect(seenProjectId).toBe('prj_other');
  });

  it('rejects an out-of-range --limit', async () => {
    client.setArgv('vcr', 'ls', '--limit', '9999');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('--limit');
  });

  it('errors when there is no linked project', async () => {
    mockNotLinked();
    client.setArgv('vcr', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project');
  });
});
