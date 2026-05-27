import { describe, expect, it } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('integration transfers', () => {
  const teamId = 'team_integration_transfer';
  const installationId = 'icfg_123';

  it('lists transfers', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get(
      `/v1/integrations/installations/${installationId}/transfers`,
      (_req, res) => {
        res.json({ items: [] });
      }
    );

    client.setArgv(
      'integration',
      'transfers',
      'ls',
      '--installation-id',
      installationId
    );
    const exitCode = await integration(client);
    expect(exitCode).toBe(0);
  });

  it('accepts transfer', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post(
      `/v1/integrations/installations/${installationId}/transfers/from-marketplace`,
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv(
      'integration',
      'transfers',
      'accept',
      '--installation-id',
      installationId
    );
    const exitCode = await integration(client);
    expect(exitCode).toBe(0);
  });

  it('discards transfer with --yes', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post(
      `/v1/integrations/installations/${installationId}/transfers/discard`,
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv(
      'integration',
      'transfers',
      'discard',
      '--installation-id',
      installationId,
      '--yes'
    );
    const exitCode = await integration(client);
    expect(exitCode).toBe(0);
  });
});
