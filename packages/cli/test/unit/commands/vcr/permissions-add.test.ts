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

function permissionFor(body: { teamId?: string; teamSlug?: string }) {
  return {
    repositoryId: 'repo_1',
    teamId: body.teamId ?? 'team_resolved',
    teamSlug: body.teamSlug ?? 'resolved-team',
    createdAt: '2026-06-30T10:00:00.000Z',
  };
}

describe('vcr permissions add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-permissions-add');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shares a repository with a team by id', async () => {
    const bodies: any[] = [];
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        expect(req.query.projectId).toBe('prj_vcr');
        bodies.push(req.body);
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'add', 'team_12345');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ teamId: 'team_12345' }]);
    expect(client.stderr.getFullOutput()).toContain('Shared my-app with');
  });

  it('shares a repository with a team by slug', async () => {
    const bodies: any[] = [];
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        bodies.push(req.body);
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'add', 'other-team');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([{ teamSlug: 'other-team' }]);
    expect(client.stderr.getFullOutput()).toContain(
      'Shared my-app with other-team'
    );
  });

  it('shares a repository with multiple comma-separated teams', async () => {
    const bodies: any[] = [];
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        bodies.push(req.body);
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'add',
      'team_12345,other-team'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toEqual([
      { teamId: 'team_12345' },
      { teamSlug: 'other-team' },
    ]);
  });

  it('accepts multiple team arguments', async () => {
    const bodies: any[] = [];
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        bodies.push(req.body);
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'add',
      'team_12345',
      'other-team'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(bodies).toHaveLength(2);
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'add',
      'team_12345',
      '--format',
      'json'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.permissions).toHaveLength(1);
    expect(parsed.permissions[0].teamId).toBe('team_12345');
    expect(parsed.failed).toEqual([]);
  });

  it('continues after a failed team and exits 1', async () => {
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        if (req.body.teamId === 'team_missing') {
          res.status(400).json({
            error: {
              code: 'team_not_found',
              message: 'The team to share the repository with does not exist.',
            },
          });
          return;
        }
        res.json({ permission: permissionFor(req.body) });
      }
    );

    client.setArgv(
      'vcr',
      'permissions',
      'my-app',
      'add',
      'team_missing,other-team'
    );
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Failed to share my-app with team_missing');
    expect(output).toContain('Shared my-app with other-team');
  });

  it('caps concurrent requests at 10', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (req, res) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        setTimeout(() => {
          inFlight--;
          res.json({ permission: permissionFor(req.body) });
        }, 5);
      }
    );

    const teams = Array.from({ length: 25 }, (_, i) => `team-${i}`).join(',');
    client.setArgv('vcr', 'permissions', 'my-app', 'add', teams);
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(10);
  });

  it('treats a 2xx response without a permission body as success', async () => {
    client.scenario.post(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.json({});
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'add', 'team_12345');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Shared my-app with team_12345');
    expect(output).not.toContain('Failed to share');
  });

  it('errors when the team argument is missing', async () => {
    client.setArgv('vcr', 'permissions', 'my-app', 'add');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'vcr permissions <repository> add'
    );
  });
});
