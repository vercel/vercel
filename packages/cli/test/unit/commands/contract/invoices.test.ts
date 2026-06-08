import { describe, expect, it } from 'vitest';
import contract from '../../../../src/commands/contract';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('billing invoices', () => {
  const teamId = 'team_billing_test';

  it('lists invoices', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get('/v1/invoices', (_req, res) => {
      res.json([{ id: 'inv_1' }]);
    });

    client.setArgv('contract', 'invoices', 'ls', '--format', 'json');
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.invoices[0].id).toBe('inv_1');
  });

  it('inspects an invoice', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get('/v1/invoices/inv_1', (_req, res) => {
      res.json({ id: 'inv_1', amount: 10 });
    });

    client.setArgv(
      'contract',
      'invoices',
      'inspect',
      'inv_1',
      '--format',
      'json'
    );
    const exitCode = await contract(client);
    expect(exitCode).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out.invoice.id).toBe('inv_1');
  });
});
