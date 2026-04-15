import { describe, expect, it } from 'vitest';
import observability from '../../../../src/commands/observability';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('observability notebooks', () => {
  const teamId = 'team_observability_test';

  it('lists notebooks', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get('/v1/observability/notebook', (_req, res) => {
      res.json([{ id: 'ntb_1' }]);
    });

    client.setArgv('observability', 'notebooks', 'ls', '--format', 'json');
    const exitCode = await observability(client);
    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())[0].id).toBe(
      'ntb_1'
    );
  });

  it('creates a notebook', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post('/v1/observability/notebook', (_req, res) => {
      res.json({ id: 'ntb_2' });
    });

    client.setArgv(
      'observability',
      'notebooks',
      'create',
      '--name',
      'SLO board'
    );
    const exitCode = await observability(client);
    expect(exitCode).toBe(0);
  });

  it('deletes a notebook with --yes', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.delete('/v1/observability/notebook/ntb_2', (_req, res) => {
      res.json({ ok: true });
    });

    client.setArgv('observability', 'notebooks', 'rm', 'ntb_2', '--yes');
    const exitCode = await observability(client);
    expect(exitCode).toBe(0);
  });
});
