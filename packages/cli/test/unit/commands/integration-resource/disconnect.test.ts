import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type {
  Resource,
  ResourceConnection,
} from '../../../../src/util/integration-resource/types';

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

      it('disconnects a resource selected by its stable ID while retaining confirmation', async () => {
        const resourceId = 'store_1';
        const resourceName = 'store-acme-connected-project';
        const project = 'connected-project';
        const deletedConnections: [string, string][] = [];
        useResources();
        mockDisconnectResourceFromProject({
          onDeleteRequest(resourceId, connectionId) {
            deletedConnections.push([resourceId, connectionId]);
          },
        });

        client.setArgv(
          'integration-resource',
          'disconnect',
          resourceId,
          project
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput(
          `> The resource ${resourceName} will be disconnected from project ${project}.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        expect(deletedConnections).toEqual([]);
        client.stdin.write('y\n');

        await expect(exitCodePromise).resolves.toEqual(0);
        expect(deletedConnections).toEqual([[resourceId, 'spc_1']]);
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

      it('errors when the project is not connected to the resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';
        const project = 'connected-project';

        client.setArgv('integration-resource', 'disconnect', resource, project);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: Project ${project} is not connected to resource ${resource}.`
        );
        await expect(client.stderr).toOutput(
          'Run `vercel integration list` to see which projects are connected to each resource.'
        );

        await expect(exitCodePromise).resolves.toEqual(1);
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

      it('disconnects every connection for one project and preserves other projects', async () => {
        const resource = resourceWithMultipleProjectConnections();
        const remainingConnections = [...resource.projectsMetadata!];
        const deletedConnectionIds: string[] = [];
        mockResources([resource]);
        mockDisconnectResourceFromProject({
          onDelete(connectionId) {
            deletedConnectionIds.push(connectionId);
            const index = remainingConnections.findIndex(
              connection => connection.id === connectionId
            );
            if (index !== -1) {
              remainingConnections.splice(index, 1);
            }
          },
        });

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource.name,
          'connected-project'
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput(
          `> All 2 connections between resource ${resource.name} and project connected-project will be disconnected.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('y\n');
        const exitCode = await exitCodePromise;

        expect(exitCode).toEqual(0);
        expect(deletedConnectionIds).toEqual(['spc_qa', 'spc_staging']);
        expect(remainingConnections).toEqual([
          expect.objectContaining({
            id: 'spc_other',
            projectId: 'prj_other',
          }),
        ]);
        await expect(client.stderr).toOutput(
          `> Success! Disconnected all 2 connections for connected-project from ${resource.name}`
        );
      });

      it('does not report complete success when only one project connection is deleted', async () => {
        const resource = resourceWithMultipleProjectConnections();
        const deletedConnectionIds: string[] = [];
        mockResources([resource]);
        mockDisconnectResourceFromProject({
          errorForConnectionId: 'spc_staging',
          onDelete(connectionId) {
            deletedConnectionIds.push(connectionId);
          },
        });

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource.name,
          'connected-project',
          '--yes'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(1);
        expect(deletedConnectionIds).toEqual(['spc_qa']);
        await expect(client.stderr).toOutput(
          'Error: A problem occurred while disconnecting: Response Error (500)'
        );
        expect(client.stderr.getFullOutput()).not.toContain('Success!');
      });

      it('disconnects all projects from a resource using the `--all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv('integration-resource', 'disconnect', resource, '--all');
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          '> The following projects will be disconnected:'
        );
        expect(
          stripAnsi(client.stderr.getFullOutput())
            .split(/\r?\n/)
            .map(line => line.trimStart())
            .join('\n')
        ).toContain(
          '> The following projects will be disconnected:\nconnected-project\nother-project'
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
          '> The following projects will be disconnected:'
        );
        expect(
          stripAnsi(client.stderr.getFullOutput())
            .split(/\r?\n/)
            .map(line => line.trimStart())
            .join('\n')
        ).toContain(
          '> The following projects will be disconnected:\nconnected-project\nother-project'
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput('> Canceled');

        await expect(exitCodePromise).resolves.toEqual(0);
      });
    });

    describe('--format=json', () => {
      let team: Team;
      beforeEach(() => {
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        useResources();
      });

      it('returns JSON output when disconnecting a single project with --yes', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource,
          project,
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toEqual({
          resource,
          disconnected: true,
          projects: [project],
        });
      });

      it('returns JSON output when disconnecting all projects with --all --yes', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource,
          '--all',
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toEqual({
          resource,
          disconnected: true,
          projects: ['connected-project', 'other-project'],
        });
      });

      it('should error when --format=json is used without --yes', async () => {
        const resource = 'store-acme-connected-project';

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource,
          'connected-project',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(2);
        await expect(client.stderr).toOutput(
          'Error: --json requires --yes to skip confirmation prompts'
        );
      });

      it('should track --format option in telemetry', async () => {
        useResources();
        const resource = 'store-acme-connected-project';
        const project = 'connected-project';
        mockDisconnectResourceFromProject();

        client.setArgv(
          'integration-resource',
          'disconnect',
          resource,
          project,
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:disconnect',
            value: 'disconnect',
          },
          {
            key: 'option:format',
            value: 'json',
          },
          {
            key: 'argument:resource',
            value: '[REDACTED]',
          },
          {
            key: 'argument:project',
            value: '[REDACTED]',
          },
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
        ]);
      });

      it('should error with an invalid format value', async () => {
        client.setArgv(
          'integration-resource',
          'disconnect',
          'acme',
          'project',
          '--yes',
          '--format=xml'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(2);
        await expect(client.stderr).toOutput(
          'Error: Invalid output format: "xml"'
        );
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
          await expect(exitCodePromise).resolves.toEqual(2);
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
            'Error: Cannot specify a project while using the `--all` option.'
          );
          await expect(exitCodePromise).resolves.toEqual(2);
        });
      });
    });
  });
});

function mockDisconnectResourceFromProject(options?: {
  error?: number;
  errorForConnectionId?: string;
  onDelete?: (connectionId: string) => void;
  onDeleteRequest?: (resourceId: string, connectionId: string) => void;
}): void {
  client.scenario.delete(
    '/:version/storage/stores/:resourceId/connections/:connectionId',
    (req, res) => {
      if (
        options?.error ||
        options?.errorForConnectionId === req.params.connectionId
      ) {
        res.status(options?.error ?? 500);
        res.end();
        return;
      }

      options?.onDeleteRequest?.(
        req.params.resourceId,
        req.params.connectionId
      );
      options?.onDelete?.(req.params.connectionId);
      res.status(200);
      res.end();
    }
  );
}

function mockResources(stores: Resource[]): void {
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    res.json({ stores });
  });
}

function resourceWithMultipleProjectConnections(): Resource {
  const projectsMetadata: ResourceConnection[] = [
    {
      id: 'spc_qa',
      projectId: 'prj_connected',
      name: 'connected-project',
      environments: ['env_qa123'],
    },
    {
      id: 'spc_staging',
      projectId: 'prj_connected',
      name: 'connected-project',
      environments: ['env_staging456'],
    },
    {
      id: 'spc_other',
      projectId: 'prj_other',
      name: 'other-project',
      environments: ['production'],
    },
  ];
  return {
    id: 'store_multi_connection',
    externalResourceId: 'external_multi_connection',
    type: 'integration',
    name: 'store-multi-connection',
    status: 'available',
    projectsMetadata,
  };
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
