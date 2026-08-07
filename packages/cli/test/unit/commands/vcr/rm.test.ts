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

describe('vcr rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-rm');
    client.cwd = tmpDir;
    client.input.confirm = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('vcr', 'rm', '--help');
      const exitCode = await vcr(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'vcr:rm',
        },
      ]);
    });
  });

  it('deletes a repository with --yes', async () => {
    let method = '';
    client.scenario.delete('/v1/vcr/repository/my-app', (req, res) => {
      method = req.method;
      expect(req.query.projectId).toBe('prj_vcr');
      res.status(202).end();
    });

    client.setArgv('vcr', 'rm', 'my-app', '--yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('DELETE');
    expect(client.stderr.getFullOutput()).toContain('deleted');
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.delete('/v1/vcr/repository/my-app', (_req, res) => {
      res.status(202).end();
    });

    client.setArgv('vcr', 'rm', 'my-app', '--yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:rm',
        value: 'rm',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('prompts for confirmation when --yes is omitted', async () => {
    const confirmMock = vi.fn().mockResolvedValue(false);
    client.input.confirm = confirmMock;

    client.setArgv('vcr', 'rm', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(confirmMock).toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('errors when the repository argument is missing', async () => {
    client.setArgv('vcr', 'rm');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr rm');
  });
});
