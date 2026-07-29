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

describe('vcr permissions clear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-permissions-clear');
    client.cwd = tmpDir;
    client.input.confirm = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears all permissions with --yes', async () => {
    let method = '';
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions/all',
      (req, res) => {
        method = req.method;
        expect(req.query.projectId).toBe('prj_vcr');
        res.status(204).end();
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'clear', '--yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('DELETE');
    expect(client.stderr.getFullOutput()).toContain(
      'Cleared repository permissions for my-app'
    );
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions/all',
      (_req, res) => {
        res.status(204).end();
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'clear', '--yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:permissions',
        value: 'permissions',
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

    client.setArgv('vcr', 'permissions', 'my-app', 'clear');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(confirmMock).toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions/all',
      (_req, res) => {
        res.status(204).end();
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'clear',
      '--yes',
      '--format',
      'json'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({ repository: 'my-app', cleared: true });
  });

  it('errors when the API returns a 404', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions/all',
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'VCR Repository not found.' },
        });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'clear', '--yes');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
  });
});
