import { describe, expect, it } from 'vitest';
import contract from '../../../../src/commands/contract';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('billing payment-methods', () => {
  const teamId = 'team_billing_pm_test';

  it('lists payment methods', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get(
      '/v1/integrations/installations/payment-methods',
      (_req, res) => {
        res.json([{ id: 'pm_1' }]);
      }
    );

    client.setArgv('contract', 'payment-methods', 'ls', '--format', 'json');
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.paymentMethods[0].id).toBe('pm_1');
  });

  it('sets default payment method', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post(
      '/v1/integrations/installations/icfg_1/payment-method',
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv(
      'contract',
      'payment-methods',
      'set-default',
      '--installation-id',
      'icfg_1',
      '--payment-method-id',
      'pm_1'
    );
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
  });
});
