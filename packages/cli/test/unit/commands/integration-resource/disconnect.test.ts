import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration-resource', () => {
  describe('disconnect', () => {
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

      it('disconnects a project from a resource', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv('integration-resource', 'disconnect', resource, project);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be disconnected from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Disconnecting resource…');
        await expect(client.stderr).toOutput(
          `> Success! Disconnected ${project} from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('skips confirmation when disconnecting a project from a resource with the `--yes` flag', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource,
          project,
          '--yes'
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput('Disconnecting resource…');
        await expect(client.stderr).toOutput(
          `> Success! Disconnected ${project} from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation for disconnecting a project from a resource', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv('integration-resource', 'disconnect', resource, project);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be disconnected from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when no connected project is found to disconnect from a resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';
        const project = 'connected-project';

        client.setArgv('integration-resource', 'disconnect', resource, project);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> Could not find project ${project} connected to resource ${resource}.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('disconnects the resource from the current project when no project specified', async () => {
        const cwd = setupUnitFixture('commands/integration/disconnect');
        client.cwd = cwd;
        const project = 'connected-project';

        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: project,
        });
        useResources();

        const resource = 'store-acme-connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv('integration-resource', 'disconnect', resource);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> The resource ${resource} will be disconnected from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');

        await expect(client.stderr).toOutput('Disconnecting resource…');
        await expect(client.stderr).toOutput(
          `> Success! Disconnected ${project} from ${resource}`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('disconnects all projects from a resource using the `--all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv('integration-resource', 'disconnect', resource, '--all');
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

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when resource has no projects while using `--all` flag', async () => {
        useResources();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'disconnect', resource, '--all');
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `> ${resource} has no projects to disconnect.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('exits gracefully when cancelling during confirmation while using the `--all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv('integration-resource', 'disconnect', resource, '--all');
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
    });

    describe('errors', () => {
      describe('without team', () => {
        it('should error when there is no team', async () => {
          client.setArgv('integration-resource', 'disconnect', 'acme');
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
          client.setArgv('integration-resource', 'disconnect');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'You must specify a resource. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when more arguments than a resource and project are passed', async () => {
          client.setArgv('integration-resource', 'disconnect', 'a', 'b', 'c');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Cannot specify more than one project at a time. Use `--all` to disconnect the specified resource from all projects.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when passing both a specified project and the `--all` flag', async () => {
          client.setArgv(
            'integration-resource',
            'disconnect',
            'a',
            'b',
            '--all'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Cannot specify a project while using the `--all` flag.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });
    });
  });
});

function mockDisconnectResourceFromProject(options?: { error?: number }): void {
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
