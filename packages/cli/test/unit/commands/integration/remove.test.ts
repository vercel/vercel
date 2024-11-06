import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration, useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration', () => {
  describe('remove', () => {
    beforeEach(() => {
      useUser();
    });

    describe('happy path', () => {
      let team: Team;
      beforeEach(() => {
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

      it('exits gracefully when no integration is found', async () => {
        useConfiguration();
        const integration = 'acme-no-results';

        client.setArgv('integration', 'remove', integration);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving integration…');
        await expect(client.stderr).toOutput(
          `No integration ${integration} found.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('errors', () => {
      describe('without team', () => {
        it('should error when there is no team', async () => {
          client.setArgv('integration', 'remove', 'acme');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);
          await expect(client.stderr).toOutput('Error: Team not found.');
        });
      });

      describe('with team', () => {
        let team: Team;
        beforeEach(() => {
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
