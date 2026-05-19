import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useIntegration } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration', () => {
  describe('accept-terms', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    let team: Team;

    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
    });

    it('rejects non-interactive mode for terms acceptance', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      const { installRequestBodies } = useIntegration({
        withInstallation: false,
        ownerId: team.id,
      });

      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'accept-terms',
        'acme',
        '--non-interactive'
      );
      await expect(integrationCommand(client)).rejects.toThrow('exit:1');

      expect(installRequestBodies).toHaveLength(0);

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('integration_terms_acceptance_required');
      expect(payload.policy_links?.marketplace_addendum).toMatch(
        /integration-marketplace-end-users-addendum/
      );
    });

    it('is a no-op when installation already exists', async () => {
      useIntegration({
        withInstallation: true,
        ownerId: team.id,
      });

      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'accept-terms',
        'acme',
        '--non-interactive'
      );

      const code = await integrationCommand(client);
      expect(code).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out.alreadyInstalled).toBe(true);
    });

    it('rejects aws-apg when browser install is required', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      useIntegration({
        withInstallation: false,
        ownerId: team.id,
      });

      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'accept-terms',
        'aws-apg',
        '--non-interactive'
      );

      await expect(integrationCommand(client)).rejects.toThrow('exit:1');
      const errPayload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(errPayload.message).toMatch(/browser/);
    });

    it('rejects the legacy --yes flag', async () => {
      useIntegration({
        withInstallation: false,
        ownerId: team.id,
      });

      client.setArgv('integration', 'accept-terms', 'acme', '--yes');
      const code = await integrationCommand(client);

      expect(code).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'unknown or unexpected option: --yes'
      );
    });

    describe('--help', () => {
      it('tracks telemetry', async () => {
        client.setArgv('integration', 'accept-terms', '--help');
        const code = await integrationCommand(client);
        expect(code).toBe(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: 'integration:accept-terms',
          },
        ]);
      });
    });
  });
});
