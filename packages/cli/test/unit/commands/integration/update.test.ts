import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration', () => {
  describe('update', () => {
    let team: Team;
    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
      useConfiguration();
    });

    it('updates project access with --projects all', async () => {
      let patchedBody: unknown;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          expect(req.params.id).toBe('acme-first');
          patchedBody = req.body;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedBody).toEqual({ projects: 'all' });
      await expect(client.stderr).toOutput('installation updated successfully');
    });

    it('updates billing plan with --plan', async () => {
      let patchedBody: unknown;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          expect(req.params.id).toBe('acme-first');
          patchedBody = req.body;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--plan',
        'pro',
        '--authorization-id',
        'auth_123'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedBody).toEqual({
        billingPlanId: 'pro',
        authorizationId: 'auth_123',
      });
    });

    it('outputs JSON when --format=json', async () => {
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (_req, res) => {
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--projects',
        'all',
        '--format',
        'json'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        integration: 'acme-no-projects',
        configurationId: 'acme-first',
        updated: true,
        projects: 'all',
      });
    });

    it('errors when multiple installations exist without --installation-id', async () => {
      client.setArgv(
        'integration',
        'update',
        'acme-multi',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(1);
      await expect(client.stderr).toOutput('Multiple installations found');
    });

    it('selects installation with --installation-id', async () => {
      let patchedId: string | undefined;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          patchedId = req.params.id;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-multi',
        '--installation-id',
        'icfg_install_b',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedId).toBe('icfg_install_b');
    });

    it('errors when integration slug is missing', async () => {
      client.setArgv('integration', 'update', '--projects', 'all');
      const code = await integrationCommand(client);
      expect(code).toBe(1);
      await expect(client.stderr).toOutput('must specify an integration');
    });

    it('errors when --plan and --projects are combined', async () => {
      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--plan',
        'pro',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(1);
      await expect(client.stderr).toOutput('either --plan or --projects');
    });
  });
});
