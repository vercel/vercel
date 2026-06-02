import { beforeEach, describe, expect, it, vi } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import integrationCommand from '../../../../src/commands/integration';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration-resource', () => {
  describe('connect', () => {
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

      it('connects a project to a resource with --yes', async () => {
        useResources();
        const projectName = 'connected-project';
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        const requestBody = mockConnectResourceToProject();

        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          projectName,
          '--yes'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(0);
        await expect(client.stderr).toOutput(
          '> Success! Connected store-acme-no-projects to connected-project (production, preview, development)'
        );
        expect(requestBody.value).toEqual({
          envVarEnvironments: ['production', 'preview', 'development'],
          projectId: 'prj_connected',
          type: 'integration',
        });
      });

      it('connects with selected environments only', async () => {
        useResources();
        const projectName = 'connected-project';
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        const requestBody = mockConnectResourceToProject();

        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          projectName,
          '--yes',
          '-e',
          'production',
          '-e',
          'preview'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(0);
        expect(requestBody.value).toEqual({
          envVarEnvironments: ['production', 'preview'],
          projectId: 'prj_connected',
          type: 'integration',
        });
      });

      it('connects with an env var prefix', async () => {
        useResources();
        const projectName = 'connected-project';
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        const requestBody = mockConnectResourceToProject();

        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          projectName,
          '--yes',
          '--prefix',
          'NEON2_'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(0);
        expect(requestBody.value).toEqual({
          envVarEnvironments: ['production', 'preview', 'development'],
          projectId: 'prj_connected',
          type: 'integration',
          envVarPrefix: 'NEON2_',
        });
      });

      it('errors when project is already connected to the resource', async () => {
        useResources();
        // store-acme-connected-project already has connected-project connected
        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-connected-project',
          'connected-project',
          '--yes'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Project connected-project is already connected to resource store-acme-connected-project.'
        );
        await expect(client.stderr).toOutput(
          'To change environments or env var prefix, disconnect first: `vercel integration resource disconnect store-acme-connected-project connected-project`'
        );
      });

      it('connects to the linked project when no project specified', async () => {
        const cwd = setupUnitFixture('commands/integration/disconnect');
        client.cwd = cwd;
        const projectName = 'connected-project';

        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        useResources();
        const requestBody = mockConnectResourceToProject();

        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          '--yes'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(0);
        expect(requestBody.value).toEqual({
          envVarEnvironments: ['production', 'preview', 'development'],
          projectId: 'prj_connected',
          type: 'integration',
        });
      });

      it('is reachable via `integration resource connect`', async () => {
        useResources();
        const projectName = 'connected-project';
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        mockConnectResourceToProject();

        client.setArgv(
          'integration',
          'resource',
          'connect',
          'store-acme-no-projects',
          projectName,
          '--yes'
        );
        const exitCode = await integrationCommand(client);

        expect(exitCode).toEqual(0);
        await expect(client.stderr).toOutput(
          '> Success! Connected store-acme-no-projects to connected-project (production, preview, development)'
        );
      });
    });

    describe('--format=json', () => {
      let team: Team;
      beforeEach(() => {
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
      });

      it('emits JSON on success with --yes', async () => {
        useResources();
        const projectName = 'connected-project';
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: projectName,
        });
        mockConnectResourceToProject();

        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          projectName,
          '--yes',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);

        expect(exitCode).toEqual(0);
        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toEqual({
          resource: 'store-acme-no-projects',
          connected: true,
          project: projectName,
          environments: ['production', 'preview', 'development'],
        });
      });

      it('errors when --format=json is used without --yes', async () => {
        client.setArgv(
          'integration-resource',
          'connect',
          'store-acme-no-projects',
          'connected-project',
          '--format=json'
        );
        const exitCode = await integrationResourceCommand(client);
        expect(exitCode).toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: --format=json requires --yes to skip confirmation prompts'
        );
      });
    });

    describe('errors', () => {
      describe('without team', () => {
        it('errors when there is no team', async () => {
          client.setArgv(
            'integration-resource',
            'connect',
            'store-acme-no-projects',
            'connected-project',
            '--yes'
          );
          const exitCode = await integrationResourceCommand(client);
          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput('Error: Team not found.');
        });
      });

      describe('with team', () => {
        let team: Team;
        beforeEach(() => {
          const teams = useTeams('team_dummy');
          team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
        });

        it('errors when no resource argument is given', async () => {
          client.setArgv('integration-resource', 'connect');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'You must specify a resource. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('errors when too many arguments are passed', async () => {
          client.setArgv('integration-resource', 'connect', 'a', 'b', 'c');
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Too many arguments. Usage: `vercel integration resource connect <resource> [project]`.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('errors on invalid --prefix value', async () => {
          client.setArgv(
            'integration-resource',
            'connect',
            'store-acme-no-projects',
            'connected-project',
            '--yes',
            '--prefix',
            '1bad'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Invalid --prefix value.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('errors on invalid --environment value', async () => {
          client.setArgv(
            'integration-resource',
            'connect',
            'store-acme-no-projects',
            'connected-project',
            '--yes',
            '-e',
            'staging'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Invalid environment value: "staging".'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('errors when the resource does not exist', async () => {
          useResources();
          client.setArgv(
            'integration-resource',
            'connect',
            'does-not-exist',
            'connected-project',
            '--yes'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: No resource does-not-exist found.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('rewrites the env-var-collision API error with --prefix guidance', async () => {
          useResources();
          useProject({
            ...defaultProject,
            id: 'prj_connected',
            name: 'connected-project',
          });
          // Mock the API returning the env var collision error
          client.scenario.post(
            '/:version/storage/stores/:resourceId/connections',
            (_req, res) => {
              res.status(400).json({
                error: {
                  code: 'bad_request',
                  message:
                    'This project already has an existing environment variable with name SHOPIFY_STOREFRONT_ACCESS_TOKEN in one of the chosen environments',
                },
              });
            }
          );

          client.setArgv(
            'integration-resource',
            'connect',
            'store-acme-no-projects',
            'connected-project',
            '--yes'
          );
          const exitCode = await integrationResourceCommand(client);
          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Cannot connect: env var SHOPIFY_STOREFRONT_ACCESS_TOKEN already exists on project connected-project'
          );
          await expect(client.stderr).toOutput(
            'Re-run with `--prefix <PREFIX>_` to namespace the new variables, or remove the existing one with `vercel env rm SHOPIFY_STOREFRONT_ACCESS_TOKEN`.'
          );
        });

        it('emits structured agent error in non-interactive mode without --yes', async () => {
          useResources();
          useProject({
            ...defaultProject,
            id: 'prj_connected',
            name: 'connected-project',
          });
          vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
            throw new Error('exit');
          }) as () => never);

          client.nonInteractive = true;
          client.setArgv(
            'integration-resource',
            'connect',
            'store-acme-no-projects',
            'connected-project'
          );

          await expect(integrationResourceCommand(client)).rejects.toThrow(
            'exit'
          );
          const payload = JSON.parse(client.stdout.getFullOutput());
          expect(payload).toMatchObject({
            status: 'error',
            reason: 'confirmation_required',
            message: expect.stringMatching(/confirmation|--yes/),
            next: expect.arrayContaining([
              expect.objectContaining({
                command: expect.stringContaining('--yes'),
              }),
            ]),
          });
        });
      });
    });
  });
});

function mockConnectResourceToProject(): { value: unknown } {
  const ref: { value: unknown } = { value: undefined };
  client.scenario.post(
    '/:version/storage/stores/:resourceId/connections',
    (req, res) => {
      ref.value = req.body;
      res.status(200).json({});
    }
  );
  return ref;
}
