import { describe, expect, it } from 'vitest';
import contract from '../../../../src/commands/contract';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('billing plan', () => {
  const teamId = 'team_billing_plan_test';

  it('previews current plan', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get('/plan', (_req, res) => {
      res.json({ current: 'pro' });
    });

    client.setArgv('contract', 'plan', 'preview', '--format', 'json');
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.plan.current).toBe('pro');
  });

  it('changes plan with --to', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.put('/v1/plan/change', (_req, res) => {
      res.json({ ok: true });
    });

    client.setArgv('contract', 'plan', 'change', '--to', 'enterprise');
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
  });
});
