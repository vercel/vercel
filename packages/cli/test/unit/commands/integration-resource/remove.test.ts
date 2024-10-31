import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration-resource', () => {
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

      it('deletes a resource with no connected projects', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'remove', resource);
        const exitCodePromise = integrationResourceCommand(client);

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

      it('skips confirmation when deleting a resource with no connected projects using the `--yes` flag', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'remove', resource, '--yes');
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when no resource is found to delete', async () => {
        useResources();
        const resource = 'not-a-real-project-to-find';

        client.setArgv('integration-resource', 'remove', resource);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: No resource ${resource} found.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling confirmation for deleting a resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'remove', resource);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('disconnects all projects from a resource before deleting it using the `--disconnect-all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration-resource',
          'remove',
          resource,
          '--disconnect-all'
        );
        const exitCodePromise = integrationResourceCommand(client);

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

      it('continues to deletion on resource with no connected projects when using the `--disconnect-all` flags', async () => {
        useResources();
        const resource = 'store-acme-no-projects';
        mockDeleteResource();

        client.setArgv(
          'integration-resource',
          'remove',
          resource,
          '--disconnect-all'
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> ${resource} has no projects to disconnect.`
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

      it('skips confirmations using the `--yes` flag when disconnecting a project from a resource and deleting it', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--disconnect-all',
          '--yes'
        );
        const exitCodePromise = integrationResourceCommand(client);

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

      it('exits gracefully when cancelling during confirmation for disconnecting projects from a resource when using the `--disconnect-all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';

        client.setArgv(
          'integration-resource',
          'remove',
          resource,
          '--disconnect-all'
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be disconnected:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for deleting a resource when using the `--disconnect-all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv(
          'integration-resource',
          'remove',
          resource,
          '--disconnect-all'
        );
        const exitCodePromise = integrationResourceCommand(client);

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
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('errors', () => {
      describe('without team', () => {
        it('should error when there is no team', async () => {
          client.setArgv('integration-resource', 'remove', 'acme');
          const exitCode = await integrationResourceCommand(client);
          expect(
            exitCode,
            'exit code for "integrationResourceCommand"'
          ).toEqual(1);
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
          client.setArgv('integration-resource', 'remove');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'You must specify a resource. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when more than one resource is passed', async () => {
          client.setArgv('integration-resource', 'remove', 'a', 'b');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Cannot specify more than one resource at a time.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when attempting to remove a resource with projects', async () => {
          useResources();
          const resource = 'store-acme-connected-project';

          client.setArgv('integration-resource', 'remove', resource);
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput(
            `Error: Cannot delete resource ${resource} while it has connected projects. Please disconnect any projects using this resource first or use the \`--disconnect-all\` flag.`
          );

          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });
    });
  });
});

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
