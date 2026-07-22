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

function mockTagAndRepository() {
  client.scenario.get('/v1/vcr/repository/my-app/tags/latest', (req, res) => {
    expect(req.query.projectId).toBe('prj_vcr');
    res.json({
      tag: {
        tag: 'latest',
        imageId: 'img_1',
        manifestDigest: 'sha256:abc',
        kind: 'manifest',
        arch: 'amd64',
        status: 'ready',
        sizeInBytes: 2097152,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });
  client.scenario.get('/v1/vcr/repository/my-app', (_req, res) => {
    res.json({ repository: { name: 'my-app' } });
  });
}

describe('vcr tag inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-tags-inspect');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'tag', 'inspect', '--help');
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

  it('inspects a single tag', async () => {
    mockTagAndRepository();

    client.setArgv('vcr', 'tag', 'inspect', 'my-app', 'latest');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('latest');
    expect(out).toContain('img_1');
    expect(out).toContain('sha256:abc');
    expect(out).toContain('vcr.vercel.com/my-team/vcr-project/my-app:latest');
    expect(out).not.toContain('{');
  });

  it('still routes via the "tags" alias', async () => {
    mockTagAndRepository();

    client.setArgv('vcr', 'tags', 'inspect', 'my-app', 'latest');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('img_1');
  });

  it('tracks subcommand invocation', async () => {
    mockTagAndRepository();

    client.setArgv('vcr', 'tag', 'inspect', 'my-app', 'latest');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:tag',
        value: 'tag',
      },
    ]);
  });

  it('prints json output', async () => {
    mockTagAndRepository();

    client.setArgv(
      'vcr',
      'tag',
      'inspect',
      'my-app',
      'latest',
      '--format',
      'json'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.tag).toBe('latest');
    expect(parsed.imageId).toBe('img_1');
    expect(parsed.manifestDigest).toBe('sha256:abc');
  });

  it('errors when the tag argument is missing', async () => {
    client.setArgv('vcr', 'tag', 'inspect', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr tag inspect');
  });

  it('reports a not found tag', async () => {
    client.scenario.get(
      '/v1/vcr/repository/my-app/tags/missing',
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'VCR Tag not found.' },
        });
      }
    );
    client.scenario.get('/v1/vcr/repository/my-app', (_req, res) => {
      res.json({ repository: { name: 'my-app' } });
    });

    client.setArgv('vcr', 'tag', 'inspect', 'my-app', 'missing');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
  });
});
