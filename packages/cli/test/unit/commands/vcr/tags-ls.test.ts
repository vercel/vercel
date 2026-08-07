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

describe('vcr tag ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-tags-ls');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'tag', 'ls', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:tag',
        },
      ]);
    });
  });

  it('lists tags for a repository', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/tags', (req, res) => {
      expect(req.query.projectId).toBe('prj_vcr');
      res.json({
        tags: [
          {
            tag: 'latest',
            imageId: 'img_1',
            arch: 'amd64',
            sizeInBytes: 1048576,
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    });

    client.setArgv('vcr', 'tag', 'ls', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('latest');
    expect(out).toContain('img_1');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/tags', (_req, res) => {
      res.json({ tags: [] });
    });

    client.setArgv('vcr', 'tag', 'ls', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:tag',
        value: 'tag',
      },
    ]);
  });

  it('rejects an invalid --sort-by value', async () => {
    client.setArgv('vcr', 'tag', 'ls', 'my-app', '--sort-by', 'bogus');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid value for --sort-by'
    );
  });

  it('rejects an invalid --sort-order value', async () => {
    client.setArgv('vcr', 'tag', 'ls', 'my-app', '--sort-order', 'bogus');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid value for --sort-order'
    );
  });

  it('errors when the repository argument is missing', async () => {
    client.setArgv('vcr', 'tag', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr tag ls');
  });
});
