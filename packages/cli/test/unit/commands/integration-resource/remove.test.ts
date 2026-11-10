import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { Resource } from '../../../../src/util/integration-resource/types';

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

        client.setArgv('integration-resource', 'delete', resource);
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

      it('deletes a resource selected by its stable ID while retaining confirmation', async () => {
        const resourceId = 'store_4';
        const resourceName = 'store-acme-no-projects';
        const deletedResourceIds: string[] = [];
        mockDeleteResource({
          onDelete(resourceId) {
            deletedResourceIds.push(resourceId);
          },
        });

        client.setArgv('integration-resource', 'delete', resourceId);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput(
          `> ${resourceName} will be deleted permanently.`
        );
        await expect(client.stderr).toOutput('? Are you sure? (y/N)');
        expect(deletedResourceIds).toEqual([]);
        client.stdin.write('y\n');

        await expect(exitCodePromise).resolves.toEqual(0);
        expect(deletedResourceIds).toEqual([resourceId]);
      });

      it('prefers a resource name over an identical resource ID', async () => {
        const resourceReference = 'collision';
        const resourceByName: Resource = {
          id: 'store_name_match',
          externalResourceId: 'external_name_match',
          type: 'integration',
          name: resourceReference,
          projectsMetadata: [],
        };
        const resourceById: Resource = {
          id: resourceReference,
          externalResourceId: 'external_id_match',
          type: 'integration',
          name: 'other-resource',
          projectsMetadata: [],
        };
        const deletedResourceIds: string[] = [];
        // The happy-path setup registers the default stores route. Reset it so
        // this collision fixture is the only list response for the test.
        client.reset();
        useUser();
        const teams = useTeams('team_dummy');
        client.config.currentTeam = Array.isArray(teams)
          ? teams[0].id
          : teams.teams[0].id;
        mockResources([resourceByName, resourceById]);
        mockDeleteResource({
          onDelete(resourceId) {
            deletedResourceIds.push(resourceId);
          },
        });

        client.setArgv(
          'integration-resource',
          'delete',
          resourceReference,
          '--yes'
        );

        await expect(integrationResourceCommand(client)).resolves.toEqual(0);
        expect(deletedResourceIds).toEqual([resourceByName.id]);
      });

      it('skips confirmation when deleting a resource with no connected projects using the `--yes` flag', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'delete', resource, '--yes');
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput('Deleting resource…');
        await expect(client.stderr).toOutput(
          `> Success! ${resource} successfully deleted.`
        );

        await expect(exitCodePromise).resolves.toEqual(0);
      });

      it('parses resource when global flags precede integration-resource', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv(
          '--cwd',
          '/tmp/p',
          '--non-interactive',
          'integration-resource',
          'delete',
          resource,
          '--yes'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toBe(0);
        await expect(client.stderr).toOutput('Deleting resource…');
      });

      it('exits gracefully when no resource is found to delete', async () => {
        useResources();
        const resource = 'not-a-real-project-to-find';

        client.setArgv('integration-resource', 'delete', resource);
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');
        await expect(client.stderr).toOutput(
          `Error: No resource ${resource} found.`
        );

        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('exits gracefully when cancelling confirmation for deleting a resource', async () => {
        useResources();
        const resource = 'store-acme-no-projects';

        client.setArgv('integration-resource', 'delete', resource);
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
          'delete',
          resource,
          '--disconnect-all'
        );
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
          'delete',
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
          'delete',
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
          'delete',
          resource,
          '--disconnect-all'
        );
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

      it('exits gracefully when cancelling during confirmation for deleting a resource when using the `--disconnect-all` flag', async () => {
        useResources();
        const resource = 'store-foo-bar-both-projects';
        mockDisconnectResourceFromAllProjects();

        client.setArgv(
          'integration-resource',
          'delete',
          resource,
          '--disconnect-all'
        );
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

        await expect(client.stderr).toOutput(
          `> ${resource} will be deleted permanently.`
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

      it('returns JSON output when deleting a resource with --yes', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv(
          'integration-resource',
          'delete',
          resource,
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toEqual({
          resource,
          removed: true,
        });
      });

      it('should error when --format=json is used without --yes', async () => {
        const resource = 'store-acme-no-projects';

        client.setArgv(
          'integration-resource',
          'delete',
          resource,
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(2);
        await expect(client.stderr).toOutput(
          'Error: --json requires --yes to skip confirmation prompts'
        );
      });

      it.each([
        ['rm', false],
        ['del', false],
        ['remove', true],
      ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
        useResources();
        mockDeleteResource();

        client.setArgv(
          'integration-resource',
          name,
          'store-acme-no-projects',
          '--yes'
        );
        expect(await integrationResourceCommand(client)).toEqual(0);
        const warning =
          '`vercel integration-resource remove` is deprecated. Use `vercel integration resource delete`.';
        if (deprecated) {
          expect(client.stderr.getFullOutput()).toContain(warning);
        } else {
          expect(client.stderr.getFullOutput()).not.toContain(warning);
        }
      });

      it('should track --format option in telemetry', async () => {
        useResources();
        mockDeleteResource();
        const resource = 'store-acme-no-projects';

        client.setArgv(
          'integration-resource',
          'delete',
          resource,
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:delete',
            value: 'delete',
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
            key: 'flag:yes',
            value: 'TRUE',
          },
        ]);
      });

      it('should error with an invalid format value', async () => {
        client.setArgv(
          'integration-resource',
          'delete',
          'acme',
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
          client.setArgv('integration-resource', 'delete', 'acme');
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

        afterEach(() => {
          vi.restoreAllMocks();
        });

        it('should error when no arguments passed', async () => {
          client.setArgv('integration-resource', 'delete');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'You must specify a resource. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(2);
        });

        it('should error when more than one resource is passed', async () => {
          client.setArgv('integration-resource', 'delete', 'a', 'b');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Cannot specify more than one resource at a time.'
          );
          await expect(exitCodePromise).resolves.toEqual(2);
        });

        it('writes structured JSON in non-interactive mode when more than one resource is passed', async () => {
          vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code ?? 0}`);
          }) as () => never);
          client.nonInteractive = true;
          client.setArgv(
            '--cwd',
            '/tmp/r',
            'integration-resource',
            'delete',
            'a',
            'b',
            '--yes'
          );
          await expect(integrationResourceCommand(client)).rejects.toThrow(
            'exit:2'
          );
          const payload = JSON.parse(client.stdout.getFullOutput().trim());
          expect(payload.status).toBe('error');
          expect(payload.reason).toBe('invalid_arguments');
          expect(payload.next?.[0]?.command).toContain(
            'integration resource delete <resource> --disconnect-all --yes'
          );
          expect(payload.next?.[0]?.command).toContain('--cwd /tmp/r');
        });

        it('should error when attempting to remove a resource with projects', async () => {
          useResources();
          const resource = 'store-acme-connected-project';

          client.setArgv('integration-resource', 'delete', resource);
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput(
            `Error: Cannot delete resource ${resource} while it has connected projects. Please disconnect any projects using this resource first or use the \`--disconnect-all\` option.`
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

function mockResources(stores: Resource[]): void {
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    res.json({ stores });
  });
}

function mockDeleteResource(options?: {
  error?: number;
  onDelete?: (resourceId: string) => void;
}): void {
  client.scenario.delete(
    '/v1/storage/stores/integration/:resourceId',
    (req, res) => {
      if (options?.error) {
        res.status(options.error);
        res.end();
        return;
      }

      options?.onDelete?.(req.params.resourceId);
      res.status(200);
      res.end();
    }
  );
}
