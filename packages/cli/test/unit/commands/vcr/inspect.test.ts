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

describe('vcr inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-inspect');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'inspect', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:inspect',
        },
      ]);
    });
  });

  it('fetches a single repository', async () => {
    client.scenario.get('/v1/vcr/repository/my-app', (req, res) => {
      expect(req.query.projectId).toBe('prj_vcr');
      res.json({ repository: { id: 'repo_1', name: 'my-app' } });
    });

    client.setArgv('vcr', 'inspect', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('repo_1');
    expect(out).not.toContain('{');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.get('/v1/vcr/repository/my-app', (_req, res) => {
      res.json({ repository: { id: 'repo_1', name: 'my-app' } });
    });

    client.setArgv('vcr', 'inspect', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
    ]);
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.get('/v1/vcr/repository/my-app', (_req, res) => {
      res.json({ repository: { id: 'repo_1', name: 'my-app' } });
    });

    client.setArgv('vcr', 'inspect', 'my-app', '--format', 'json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.id).toBe('repo_1');
  });

  it('errors when the repository argument is missing', async () => {
    client.setArgv('vcr', 'inspect');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr inspect');
  });
});
