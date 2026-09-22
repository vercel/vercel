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

function mockImageAndRepository() {
  client.scenario.get('/v1/vcr/repository/my-app/images/img_1', (req, res) => {
    expect(req.query.projectId).toBe('prj_vcr');
    res.json({
      image: {
        id: 'img_1',
        manifestDigest: 'sha256:abc',
        kind: 'manifest',
        arch: 'amd64',
        sizeInBytes: 2097152,
        status: 'ready',
        createdAt: new Date().toISOString(),
        tags: ['latest'],
      },
    });
  });
  client.scenario.get('/v1/vcr/repository/my-app', (_req, res) => {
    res.json({ repository: { name: 'my-app' } });
  });
}

describe('vcr image inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-image-inspect');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'image', 'inspect', '--help');
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

  it('inspects a single image', async () => {
    mockImageAndRepository();

    client.setArgv('vcr', 'image', 'inspect', 'my-app', 'img_1');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('img_1');
    expect(out).toContain('sha256:abc');
    expect(out).toContain(
      'vcr.vercel.com/my-team/vcr-project/my-app@sha256:abc'
    );
    expect(out).not.toContain('{');
  });

  it('tracks subcommand invocation', async () => {
    mockImageAndRepository();

    client.setArgv('vcr', 'image', 'inspect', 'my-app', 'img_1');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:image',
        value: 'image',
      },
    ]);
  });

  it('prints json output', async () => {
    mockImageAndRepository();

    client.setArgv(
      'vcr',
      'image',
      'inspect',
      'my-app',
      'img_1',
      '--format',
      'json'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toBe('img_1');
    expect(parsed.manifestDigest).toBe('sha256:abc');
  });

  it('errors when the imageId argument is missing', async () => {
    client.setArgv('vcr', 'image', 'inspect', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr image inspect');
  });
});
