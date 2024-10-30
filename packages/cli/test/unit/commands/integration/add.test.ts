import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../../src/commands/integration';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useIntegration } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams, type Team } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

const openMock = vi.mocked(open);

beforeEach(() => {
  openMock.mockClear();
});

describe('integration', () => {
  describe('add', () => {
    describe('--help', () => {
      it('tracks telemetry', async () => {
        const command = 'integration';
        const subcommand = 'add';

        client.setArgv(command, subcommand, '--help');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(2);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: `${command}:${subcommand}`,
          },
        ]);
      });
    });

    describe('[name]', () => {
      let team: Team;

      beforeEach(() => {
        useUser();
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
      });

      it('should track subcommand usage', async () => {
        client.setArgv('integration', 'add');
        const exitCodePromise = integrationCommand(client);
        await expect(client.stderr).toOutput(
          'Error: You must pass an integration slug'
        );
        await expect(exitCodePromise).resolves.toEqual(1);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:add',
            value: 'add',
          },
        ]);
      });

      describe('missing installation', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: false });
        });

        it('should handle provisioning resource in project context', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&projectId=vercel-integration-add&cmd=add'
          );
        });

        it('should handle provisioning resource on team-level in project context', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&cmd=add'
          );
        });

        it('should handle provisioning resource without project context', async () => {
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&cmd=add'
          );
        });

        it('should track [name] positional argument with known integration name', async () => {
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:add',
              value: 'add',
            },
            {
              key: 'argument:name',
              value: 'acme',
            },
          ]);
        });
      });

      describe('with installation', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: true });
        });

        it('should handle provisioning resource in project context', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'What is the name of the resource?'
          );
          client.stdin.write('test-resource\n');
          await expect(client.stderr).toOutput(
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: test-resource
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput('Select environments');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'test-resource successfully connected to vercel-integration-add'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should handle provisioning resource on team-level in project context', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'What is the name of the resource?'
          );
          client.stdin.write('test-resource\n');
          await expect(client.stderr).toOutput(
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: test-resource
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('n\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should handle provisioning resource without project context', async () => {
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'What is the name of the resource?'
          );
          client.stdin.write('test-resource\n');
          await expect(client.stderr).toOutput(
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: test-resource
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should require the vercel dashboard for expressions in UI wizard', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme-unsupported');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            'This resource must be provisioned through the Web UI. Open Vercel Dashboard?'
          );
          client.stdin.write('Y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&cmd=add'
          );
        });

        it('should gracefully exit when the user does not want to continue the setup wizard in the Vercel dashboard for an install flow using expressions in UI display rules', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme-unsupported');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            'This resource must be provisioned through the Web UI. Open Vercel Dashboard?'
          );
          client.stdin.write('n\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
        });
      });

      describe('errors', () => {
        it('should error when no integration arugment was passed', async () => {
          client.setArgv('integration', 'add');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: You must pass an integration slug'
          );
        });

        it('should error when more than one integration arugment was passed', async () => {
          client.setArgv('integration', 'add', 'acme', 'acme-two');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
          await expect(client.stderr).toOutput(
            'Cannot install more than one integration at a time'
          );
        });

        it('should error when integration was not found', async () => {
          useIntegration({ withInstallation: true });
          client.setArgv('integration', 'add', 'does-not-exist');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Failed to get integration "does-not-exist": Response Error (404)'
          );
        });

        it('should track redacted [name] positional argument when integration is not found', async () => {
          useIntegration({ withInstallation: true });
          client.setArgv('integration', 'add', 'does-not-exist');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:add',
              value: 'add',
            },
            {
              key: 'argument:name',
              value: '[REDACTED]',
            },
          ]);
        });

        it('should error when integration is an external integration', async () => {
          useIntegration({ withInstallation: true });
          client.setArgv('integration', 'add', 'acme-external');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Integration "acme-external" is not a Marketplace integration'
          );
        });

        it('should error when integration has no products', async () => {
          useIntegration({ withInstallation: true });
          client.setArgv('integration', 'add', 'acme-no-products');
          const exitCodePromise = integrationCommand(client);
          await expect(exitCodePromise).resolves.toEqual(1);
          await expect(client.stderr).toOutput('Error: Product not found');
        });
      });
    });
  });
});
