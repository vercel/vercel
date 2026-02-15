import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration, useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration', () => {
  describe('remove', () => {
    describe('happy path', () => {
      let team: Team;
      beforeEach(() => {
        useUser();
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        useResources();
      });

      it('removes an integration with no resources', async () => {
        useConfiguration();
        mockDeleteIntegration();
        const integration = 'acme-no-projects';

        client.setArgv('integration', 'remove', integration);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');

        await expect(client.stderr).toOutput(
          `> The ${integration} integration will be removed permanently from team ${team.name}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Uninstalling integration…');
        await expect(client.stderr).toOutput(
          `${integration} successfully removed.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('removes an integration with no resources skipping confirmations using the `--yes` flag', async () => {
        useConfiguration();
        mockDeleteIntegration();
        const integration = 'acme-no-projects';

        client.setArgv('integration', 'remove', integration, '--yes');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');
        await expect(client.stderr).toOutput('Uninstalling integration…');
        await expect(client.stderr).toOutput(
          `> Success! ${integration} successfully removed.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for removing an integration', async () => {
        useConfiguration();
        const integration = 'acme-no-projects';

        client.setArgv('integration', 'remove', integration);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');

        await expect(client.stderr).toOutput(
          `> The ${integration} integration will be removed permanently from team ${team.name}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput('Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('returns 1 with nudge message when no integration is found', async () => {
        useConfiguration();
        const integration = 'acme-no-results';

        client.setArgv('integration', 'remove', integration);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');
        await expect(client.stderr).toOutput(
          `No integration ${integration} found. To remove a resource, use the \`--resource\` flag.`
        );

        await expect(exitCodePromise).resolves.toEqual(1);
      });
    });

    describe('remove --resource', () => {
      let team: Team;
      beforeEach(() => {
        useUser();
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        useResources();
      });

      it('deletes a resource with no connected projects', async () => {
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', `--resource=${resource}`);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('skips confirmation with `--yes`', async () => {
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv(
          'integration',
          'remove',
          `--resource=${resource}`,
          '--yes'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('returns 1 when resource not found', async () => {
        const resource = 'not-a-real-resource';

        client.setArgv('integration', 'remove', `--resource=${resource}`);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: No resource ${resource} found.`
        );

        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('disconnects all projects then deletes with `--disconnect-all`', async () => {
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          `--resource=${resource}`,
          '--disconnect-all'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be disconnected:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Disconnecting projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Disconnected all projects from ${resource}`
        );

        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('skips all confirmations with `--disconnect-all --yes`', async () => {
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          `--resource=${resource}`,
          '--disconnect-all',
          '--yes'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          'Disconnecting projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Disconnected all projects from ${resource}`
        );

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('errors when resource has connected projects without `--disconnect-all`', async () => {
        const resource = 'store-acme-connected-project';

        client.setArgv('integration', 'remove', `--resource=${resource}`);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: Cannot delete resource ${resource} while it has connected projects. Please disconnect any projects using this resource first or use the \`--disconnect-all\` flag.`
        );

        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('errors when `--disconnect-all` is used without `--resource`', async () => {
        client.setArgv(
          'integration',
          'remove',
          'something',
          '--disconnect-all'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput(
          'Error: The `--disconnect-all` flag can only be used with `--resource`.'
        );

        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('exits gracefully on cancel', async () => {
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', `--resource=${resource}`);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('without currentTeam (defaultTeamId fallback)', () => {
      it('finds integration when currentTeam is not set', async () => {
        useUser({
          version: 'northstar',
          defaultTeamId: 'team_dummy',
        });
        useTeams('team_dummy');
        // Explicitly do NOT set client.config.currentTeam
        useResources();

        // Mock that validates teamId is present in the request
        client.scenario.get(
          '/:version/integrations/configurations',
          (req, res) => {
            const { teamId, integrationIdOrSlug } = req.query;
            if (!teamId) {
              res.status(400).json({ error: 'teamId is required' });
              return;
            }
            if (integrationIdOrSlug === 'acme') {
              res.json([
                {
                  id: 'acme-1',
                  integrationId: 'acme',
                  ownerId: 'team_dummy',
                  slug: 'acme',
                  teamId: 'team_dummy',
                  userId: 'user_dummy',
                  scopes: ['read-write:integration-resource'],
                  source: 'marketplace',
                  installationType: 'marketplace',
                  projects: [],
                },
              ]);
            } else {
              res.json([]);
            }
          }
        );
        mockDeleteIntegration();

        client.setArgv('integration', 'remove', 'acme', '--yes');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');
        await expect(client.stderr).toOutput(
          `> Success! acme successfully removed.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('errors', () => {
      describe('without team', () => {
        it('should error when there is no team', async () => {
          useUser();
          client.setArgv('integration', 'remove', 'acme');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);
          await expect(client.stderr).toOutput('Error: Team not found.');
        });
      });

      describe('with team', () => {
        let team: Team;
        beforeEach(() => {
          useUser();
          const teams = useTeams('team_dummy');
          team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
          useResources();
        });

        it('should error when no arguments passed', async () => {
          client.setArgv('integration', 'remove');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Error: You must specify an integration. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when more arguments than a single integration are passed', async () => {
          client.setArgv('integration', 'remove', 'a', 'b');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Cannot specify more than one integration at a time.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error in non-TTY without `--yes`', async () => {
          (client.stdin as { isTTY?: boolean }).isTTY = false;
          client.setArgv('integration', 'remove', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Confirmation required. Use `--yes` to skip confirmation in non-interactive mode.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error in non-TTY without `--yes` when using `--resource`', async () => {
          (client.stdin as { isTTY?: boolean }).isTTY = false;
          client.setArgv(
            'integration',
            'remove',
            '--resource=store-acme-no-projects'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Confirmation required. Use `--yes` to skip confirmation in non-interactive mode.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when attempting to remove an integration with resources', async () => {
          useConfiguration();
          const integration = 'acme-no-projects';
          const errorOptions = {
            errorStatus: 403,
            errorMessage: 'Cannot uninstall integration with resources',
          };
          mockDeleteIntegration(errorOptions);

          client.setArgv('integration', 'remove', integration);
          const exitCodePromise = integrationCommand(client);

          await expect(client.stderr).toOutput('Retrieving integration…');
          await expect(client.stderr).toOutput(
            `> The ${integration} integration will be removed permanently from team ${team.name}.`
          );
          await expect(client.stderr).toOutput('? Are you sure? (y/N)');
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Uninstalling integration…');

          await expect(client.stderr).toOutput(
            `Error: Failed to remove ${integration}: ${errorOptions.errorMessage} (${errorOptions.errorStatus})`
          );

          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });
    });
  });
});

function mockDeleteIntegration(options?: {
  errorStatus: number;
  errorMessage: string;
}): void {
  client.scenario.post(
    '/:version/integrations/installations/:integrationIdOrSlug/uninstall',
    (req, res) => {
      const { integrationIdOrSlug } = req.query;

      if (options) {
        res
          .status(options.errorStatus)
          .json({ error: { message: options.errorMessage } });
        return;
      }

      if (integrationIdOrSlug === 'error') {
        res.sendStatus(500);
        return;
      }

      res.sendStatus(200);
    }
  );
}

function mockDeleteResource(options?: { error?: number }): void {
  client.scenario.delete(
    '/v1/storage/stores/integration/:resourceId',
    (req, res) => {
      if (options?.error) {
        res.status(options.error);
        res.end();
        return;
      }

      res.status(200);
      res.end();
    }
  );
}

function mockDisconnectResourceFromAllProjects(options?: {
  error?: number;
}): void {
  client.scenario.delete(
    '/:version/storage/stores/:resourceId/connections',
    (req, res) => {
      if (options?.error) {
        res.status(options.error);
        res.end();
        return;
      }

      res.status(200);
      res.end();
    }
  );
}
