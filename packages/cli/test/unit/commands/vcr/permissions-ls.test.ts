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

describe('vcr permissions ls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-permissions-ls');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists teams with access using the team slug', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/permissions', (req, res) => {
      expect(req.query.projectId).toBe('prj_vcr');
      expect(req.query.limit).toBe('100');
      res.json({
        permissions: [
          {
            repositoryId: 'repo_1',
            teamId: 'team_other',
            teamSlug: 'other-team',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });

    client.setArgv('vcr', 'permissions', 'my-app', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('other-team');
    expect(output).not.toContain('team_other');
  });

  it('supports the list alias', async () => {
    client.scenario.get(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.json({ permissions: [] });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'list');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'This repository has not been shared with any teams.'
    );
  });

  it('tracks subcommand invocation', async () => {
    client.scenario.get(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.json({ permissions: [] });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:permissions',
        value: 'permissions',
      },
    ]);
  });

  it('outputs JSON with --format json', async () => {
    client.scenario.get(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.json({
          permissions: [
            {
              repositoryId: 'repo_1',
              teamId: 'team_other',
              teamSlug: 'other-team',
              createdAt: '2026-06-30T10:00:00.000Z',
            },
          ],
        });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'ls', '--format', 'json');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.permissions).toHaveLength(1);
    expect(parsed.permissions[0].teamSlug).toBe('other-team');
  });

  it('passes a custom limit through', async () => {
    let limit = '';
    client.scenario.get('/v1/vcr/repository/my-app/permissions', (req, res) => {
      limit = String(req.query.limit);
      res.json({ permissions: [] });
    });

    client.setArgv('vcr', 'permissions', 'my-app', 'ls', '--limit', '5');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(limit).toBe('5');
  });

  it('errors when the API returns a 404', async () => {
    client.scenario.get(
      '/v1/vcr/repository/my-app/permissions',
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'VCR Repository not found.' },
        });
      }
    );

    client.setArgv('vcr', 'permissions', 'my-app', 'ls');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
  });
});
