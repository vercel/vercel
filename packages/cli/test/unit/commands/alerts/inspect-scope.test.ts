import { beforeEach, describe, expect, it } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { createTeam, useTeams } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import alerts from '../../../../src/commands/alerts';

// These tests use the real scope and link resolution, unlike index.test.ts,
// so they cover how `--scope` and repository links pick the team.
describe('alerts inspect scope in an unlinked directory', () => {
  let requestQuery: Record<string, string> | undefined;

  beforeEach(() => {
    useUser();
    requestQuery = undefined;
    client.cwd = setupTmpDir();
    client.scenario.get('/alerts/v3/groups/:groupId', (req, res) => {
      requestQuery = req.query as Record<string, string>;
      res.json({ id: req.params.groupId, status: 'active' });
    });
  });

  it('uses the team selected with --scope', async () => {
    const [team] = useTeams('team_scoped') as ReturnType<typeof createTeam>[];
    // The global `--scope` flag is applied to `currentTeam` before the
    // command runs.
    client.config.currentTeam = team.id;
    client.setArgv(
      'alerts',
      'inspect',
      'grp_x',
      '--scope',
      team.slug,
      '--json'
    );

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.teamId).toBe('team_scoped');
    expect(requestQuery?.projectId).toBeUndefined();
  });

  it("uses the repository link's team over the global team", async () => {
    useTeams('team_global');
    createTeam('team_repo');
    // `useTeams` only serves the teams it creates, so serve the repo team too.
    client.scenario.get('/teams/team_repo', (_req, res) => {
      res.json({ id: 'team_repo', slug: 'repo-team' });
    });
    client.config.currentTeam = 'team_global';
    await outputFile(
      join(client.cwd, '.vercel', 'repo.json'),
      JSON.stringify({
        remoteName: 'origin',
        orgId: 'team_repo',
        projects: [
          { id: 'prj_a', name: 'a', directory: 'apps/a', orgId: 'team_repo' },
          { id: 'prj_b', name: 'b', directory: 'apps/b', orgId: 'team_repo' },
        ],
      })
    );
    // Interactive runs prompt for a project at the repository root; agents
    // run non-interactively and fall back to the team scope.
    client.nonInteractive = true;
    client.setArgv('alerts', 'inspect', 'grp_x', '--json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(0);
    expect(requestQuery?.teamId).toBe('team_repo');
  });

  it('reports a saved team that can no longer be loaded as a JSON error', async () => {
    client.config.currentTeam = 'team_gone';
    client.scenario.get('/teams/team_gone', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Team not found' } });
    });
    client.setArgv('alerts', 'inspect', 'grp_x', '--json');

    const exitCode = await alerts(client);

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).error.code).toBe(
      'not_found'
    );
    expect(requestQuery).toBeUndefined();
  });
});
