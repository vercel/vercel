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

    it('installs via API when --yes and non-interactive', async () => {
      const { installRequestBodies } = useIntegration({
        withInstallation: false,
        ownerId: team.id,
      });

      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'accept-terms',
        'acme',
        '--yes',
        '--non-interactive'
      );

      const code = await integrationCommand(client);
      expect(code).toBe(0);

      expect(installRequestBodies).toHaveLength(1);
      const body = installRequestBodies[0] as {
        acceptedPolicies: Record<string, string>;
        source: string;
      };
      expect(body.source).toBe('cli');
      expect(body.acceptedPolicies.toc).toBeDefined();
      expect(body.acceptedPolicies.privacy).toBeDefined();
      expect(body.acceptedPolicies.eula).toBeDefined();

      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        integration: 'acme',
        installed: true,
      });
      expect(out.policy_links?.marketplace_addendum).toMatch(
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
        '--yes',
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
        '--yes',
        '--non-interactive'
      );

      await expect(integrationCommand(client)).rejects.toThrow('exit:1');
      const errPayload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(errPayload.message).toMatch(/browser/);
    });

    it('requires --yes in non-interactive mode', async () => {
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
        'acme',
        '--non-interactive'
      );

      await expect(integrationCommand(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_arguments');
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
