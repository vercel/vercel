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

describe('vcr permissions rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-permissions-rm');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes a team's access by id", async () => {
    const bodies: any[] = [];
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        expect(req.query.projectId).toBe('prj_vcr');
        bodies.push(req.body);
        res.status(204).end();
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'rm', 'team_12345');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ teamId: 'team_12345' }]);
    expect(client.stderr.getFullOutput()).toContain(
      'Removed access to my-app for team_12345'
    );
  });

  it("removes a team's access by slug", async () => {
    const bodies: any[] = [];
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        bodies.push(req.body);
        res.status(204).end();
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'rm', 'other-team');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ teamSlug: 'other-team' }]);
  });

  it('removes multiple comma-separated teams', async () => {
    const bodies: any[] = [];
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        bodies.push(req.body);
        res.status(204).end();
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'rm',
      'team_12345,other-team'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([
      { teamId: 'team_12345' },
      { teamSlug: 'other-team' },
    ]);
  });

  it('caps concurrent requests at 10', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        setTimeout(() => {
          inFlight--;
          res.status(204).end();
        }, 5);
      }
    );

    const teams = Array.from({ length: 25 }, (_, i) => `team-${i}`).join(',');
    client.setArgv('vcr', 'permissions', 'my-app', 'rm', teams);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(10);
  });

  it('supports the remove alias', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.status(204).end();
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'remove', 'team_12345');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.status(204).end();
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'rm',
      'team_12345',
      '--format',
      'json'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.removed).toEqual(['team_12345']);
    expect(parsed.failed).toEqual([]);
  });

  it('exits 1 when the repository is not shared with the team', async () => {
    client.scenario.delete(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.status(404).json({
          error: {
            code: 'not_found',
            message: 'The repository is not shared with this team.',
          },
        });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'rm', 'team_12345');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The repository is not shared with this team.'
    );
  });

  it('errors when the team argument is missing', async () => {
    client.setArgv('vcr', 'permissions', 'my-app', 'rm');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'vcr permissions <repository> rm'
    );
  });
});
