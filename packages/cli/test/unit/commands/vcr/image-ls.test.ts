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

describe('vcr image ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-image-ls');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'image', 'ls', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:image',
        },
      ]);
    });
  });

  it('lists images in a repository', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/images', (req, res) => {
      expect(req.query.projectId).toBe('prj_vcr');
      res.json({
        images: [
          {
            id: 'img_1',
            manifestDigest: 'sha256:abc',
            arch: 'amd64',
            sizeInBytes: 2097152,
            tags: ['latest'],
          },
        ],
      });
    });

    client.setArgv('vcr', 'image', 'ls', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('img_1');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/images', (_req, res) => {
      res.json({ images: [] });
    });

    client.setArgv('vcr', 'image', 'ls', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:image',
        value: 'image',
      },
    ]);
  });

  it('passes untagged filter through', async () => {
    let untagged = '';
    client.scenario.get('/v1/vcr/repository/my-app/images', (req, res) => {
      untagged = String(req.query.untagged);
      res.json({ images: [] });
    });

    client.setArgv('vcr', 'image', 'ls', 'my-app', '--untagged');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(untagged).toBe('true');
  });

  it('errors when the repository argument is missing', async () => {
    client.setArgv('vcr', 'image', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr image ls');
  });
});
