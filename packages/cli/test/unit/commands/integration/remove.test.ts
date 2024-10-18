import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration, useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration', () => {
  describe('list', () => {
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

      it('unlinks a project from a resource', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockUnlinkResourceFromProject();

        client.setArgv('integration', 'remove', resource, project);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be unlinked from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Unlinking resource…');
        await expect(client.stderr).toOutput(
          `> Success! Unlinked ${project} from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('skips confirmation when unlinking a project from a resource with the `--yes` flag', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockUnlinkResourceFromProject();

        client.setArgv('integration', 'remove', resource, project, '--yes');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput('Unlinking resource…');
        await expect(client.stderr).toOutput(
          `> Success! Unlinked ${project} from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for unlinking a project from a resource', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockUnlinkResourceFromProject();

        client.setArgv('integration', 'remove', resource, project);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be unlinked from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when no project is found to unlink from a resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';
        const project = 'connected-project';

        client.setArgv('integration', 'remove', resource, project);
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> Could not find project ${project} linked to resource ${resource}.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('unlinks all projects from a resource using the `--unlink-all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockUnlinkResourceFromAllProjects();

        client.setArgv('integration', 'remove', resource, '--unlink-all');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be unlinked:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Unlinking projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Unlinked all projects from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when resource has no projects while using `--unlink-all` flag', async () => {
        useResources();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', resource, '--unlink-all');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> ${resource} has no projects to unlink.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('deletes a resource with no linked projects using the `--delete` flag', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', resource, '--delete');
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

      it('skips confirmation when deleting a resource with no linked projects using both the `--delete` and `--yes` flags', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', resource, '--delete', '--yes');
        const exitCodePromise = integrationCommand(client);

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

        client.setArgv('integration', 'remove', resource, '--delete');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: No resource ${resource} found.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling confirmation for deleting a resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration', 'remove', resource, '--delete');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('deletes a resource with a single connected project after unlinking the project and using the `--delete` flag ', async () => {
        useResources();
        mockDeleteResource();
        mockUnlinkResourceFromProject();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';

        client.setArgv('integration', 'remove', resource, project, '--delete');
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be unlinked from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Unlinking resource…');
        await expect(client.stderr).toOutput(
          `> Success! Unlinked ${project} from ${resource}`
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

      it('unlinks all projects from a resource and deletes it using both the `--unlink-all` and `--delete` flags', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockUnlinkResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--unlink-all',
          '--delete'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be unlinked:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Unlinking projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Unlinked all projects from ${resource}`
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

      it('continues to deletion on resource with no projects when using both the `--unlink-all` and `--delete` flags', async () => {
        useResources();
        const resource = 'store-acme-no-projects';
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--unlink-all',
          '--delete'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> ${resource} has no projects to unlink.`
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

      it('skips confirmations using the `--yes` flag when unlinking a project from a resource and deleting it', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockUnlinkResourceFromAllProjects();
        mockDeleteResource();

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--unlink-all',
          '--delete',
          '--yes'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          'Unlinking projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Unlinked all projects from ${resource}`
        );

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for unlinking a project from a resource when doing both with `--unlink-all` and `--delete` flags', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--unlink-all',
          '--delete'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be unlinked:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');

        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for deleting a resource when doing both with `--unlink-all` and `--delete` flags', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockUnlinkResourceFromAllProjects();

        client.setArgv(
          'integration',
          'remove',
          resource,
          '--unlink-all',
          '--delete'
        );
        const exitCodePromise = integrationCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be unlinked:\n  connected-project\n  other-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput(
          'Unlinking projects from resource…'
        );
        await expect(client.stderr).toOutput(
          `> Success! Unlinked all projects from ${resource}`
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
          client.setArgv('integration', 'remove', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
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
            'You must specify a resource or integration. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when more arguments than a resource and project are passed', async () => {
          client.setArgv('integration', 'remove', 'a', 'b', 'c');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Cannot specify more than one project at a time. Use `--unlink-all` to unlink the specified resource from all projects.'
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

        it('should error when attempting to delete a resource that has two connected projects after unlinking one project', async () => {
          useResources();
          mockUnlinkResourceFromProject();
          const resource = 'store-foo-bar-both-projects';
          const project = 'connected-project';

          client.setArgv(
            'integration',
            'remove',
            resource,
            project,
            '--delete'
          );
          const exitCodePromise = integrationCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');

          await expect(client.stderr).toOutput(
            `> The resource ${resource} will be unlinked from project ${project}.`
          );
          await expect(client.stderr).toOutput('? Are you sure? (y/N)');
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Unlinking resource…');
          await expect(client.stderr).toOutput(
            `> Success! Unlinked ${project} from ${resource}`
          );

          await expect(client.stderr).toOutput(
            `Error: Cannot delete resource ${resource} while it has linked projects. Please unlink any projects using this resource first or use the \`--unlink-all\` flag.`
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

function mockUnlinkResourceFromProject(options?: { error?: number }): void {
  client.scenario.delete(
    '/:version/storage/stores/:resourceId/connections/:connectionId',
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

function mockUnlinkResourceFromAllProjects(options?: { error?: number }): void {
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
