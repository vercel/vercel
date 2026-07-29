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

describe('vcr add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-add');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'add', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:add',
        },
      ]);
    });
  });

  it('creates a repository with a POST', async () => {
    let method = '';
    client.scenario.post('/v1/vcr/repository', (req, res) => {
      method = req.method;
      expect(req.body).toMatchObject({
        projectId: 'prj_vcr',
        name: 'my-app',
      });
      res.json({ repository: { id: 'repo_new', name: 'my-app' } });
    });

    client.setArgv('vcr', 'add', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('POST');
    expect(client.stderr.getFullOutput()).toContain('Created repository');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.post('/v1/vcr/repository', (_req, res) => {
      res.json({ repository: { id: 'repo_new', name: 'my-app' } });
    });

    client.setArgv('vcr', 'add', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
    ]);
  });

  it('surfaces a name conflict', async () => {
    client.scenario.post('/v1/vcr/repository', (_req, res) => {
      res.status(409).json({
        error: { code: 'conflict', message: 'Repository already exists.' },
      });
    });

    client.setArgv('vcr', 'add', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('already exists');
  });

  it('errors when the name argument is missing', async () => {
    client.setArgv('vcr', 'add');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr add');
  });
});
