import { describe, expect, it } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration provisioning', () => {
  const teamId = 'team_integration_provisioning';
  const installationId = 'icfg_123';

  it('gets provisioning status', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.get(
      `/v1/integrations/installations/${installationId}/billing/provision`,
      (_req, res) => {
        res.json({ status: 'ready' });
      }
    );

    client.setArgv(
      'integration',
      'provisioning',
      'status',
      '--installation-id',
      installationId,
      '--format',
      'json'
    );
    const exitCode = await integration(client);
    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim()).action).toBe(
      'status'
    );
  });

  it('triggers provisioning', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.post(
      `/v1/integrations/installations/${installationId}/billing/provision`,
      (_req, res) => {
        res.json({ queued: true });
      }
    );

    client.setArgv(
      'integration',
      'provisioning',
      'trigger',
      '--installation-id',
      installationId
    );
    const exitCode = await integration(client);
    expect(exitCode).toBe(0);
  });
});
