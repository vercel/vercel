import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../../src/commands/integration';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  useIntegration,
  usePreauthorization,
} from '../../../mocks/integration';
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
        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: `${command}:${subcommand}`,
          },
        ]);
      });

      describe('dynamic product help', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: false });
        });

        it('should show available products for multi-product integration', async () => {
          client.setArgv('integration', 'add', 'acme-two-products', '--help');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(0);
          const output = client.getFullOutput();
          expect(output).toContain('Available products for');
          expect(output).toContain('acme-a');
          expect(output).toContain('acme-b');
          expect(output).toContain(
            'vercel integration add acme-two-products/<product-slug>'
          );
        });

        it('should not show product listing for single-product integration', async () => {
          client.setArgv('integration', 'add', 'acme', '--help');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(0);
          // Single product — should NOT show product listing
          const output = client.getFullOutput();
          expect(output).not.toContain('Available products for');
        });

        it('should show available products when slash syntax is used with --help', async () => {
          client.setArgv(
            'integration',
            'add',
            'acme-two-products/acme-a',
            '--help'
          );
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(0);
          const output = client.getFullOutput();
          // Should strip product slug and still fetch the integration for dynamic help
          expect(output).toContain('Available products for');
          expect(output).toContain('acme-a');
          expect(output).toContain('acme-b');
        });

        it('should fall back to standard help when integration not found', async () => {
          client.setArgv('integration', 'add', 'does-not-exist', '--help');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(0);
          // Should still show standard help without errors
          const output = client.getFullOutput();
          expect(output).not.toContain('Available products for');
        });
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&projectId=vercel-integration-add&cmd=add'
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&cmd=add'
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&cmd=add'
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
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
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
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
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

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&cmd=add'
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

        it('should require the vercel dashboard for non-subscription billing plan selected in UI wizard', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme-prepayment');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Prepayment under ${team.slug}`
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
            'Do you want to link this resource to the current project? (Y/n)'
          );
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            'You have selected a plan that cannot be provisioned through the CLI. Open \nVercel Dashboard?'
          );
          client.stdin.write('Y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme-prepayment&productId=acme-product&source=cli&defaultResourceName=test-resource&cmd=add'
          );
        });
      });

      describe('with preauthorization steps', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: true, ownerId: team.id });
        });
        it('should handle provisioning resource with a slow authorization', async () => {
          usePreauthorization({ initialStatus: 'pending' });
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

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should require opening the dashboard to complete preauthorization on when action is required', async () => {
          usePreauthorization({ initialStatus: 'requires_action' });
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

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput(
            'Payment validation requires manual action. Please complete the steps in your browser...'
          );
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&authorizationId=success-case&source=cli&cmd=authorize'
          );
        });

        it('should exit the process when automatic preauthorization fails', async () => {
          usePreauthorization({ id: 'failure-case' });
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

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput(
            'Error: Payment validation failed. Please change your payment method via the web UI and try again.'
          );

          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should exit the process when required action preauthorization fails', async () => {
          usePreauthorization({
            id: 'failure-case',
            initialStatus: 'requires_action',
          });
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

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput(
            'Payment validation requires manual action. Please complete the steps in your browser...'
          );
          await expect(client.stderr).toOutput(
            'Error: Payment validation failed. Please change your payment method via the web UI and try again.'
          );

          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&authorizationId=failure-case&source=cli&cmd=authorize'
          );
        });
      });

      describe('product slash syntax', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: false });
        });

        it('should select product by slug with slash syntax', async () => {
          client.setArgv('integration', 'add', 'acme-two-products/acme-a');
          const exitCodePromise = integrationCommand(client);
          // Should skip "Select a product" prompt and go straight to installing
          await expect(client.stderr).toOutput(
            `Installing Acme Product A by Acme Integration Two Products under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard?'
          );
          client.stdin.write('n\n');
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
        });

        it('should error when product slug is not found', async () => {
          client.setArgv('integration', 'add', 'acme-two-products/nonexistent');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Product "nonexistent" not found. Available products: acme-a, acme-b'
          );
        });

        it('should error when slash syntax has empty product slug', async () => {
          client.setArgv('integration', 'add', 'acme/');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Invalid format. Expected: <integration-name>/<product-slug>'
          );
        });

        it('should error when slash syntax has empty integration slug', async () => {
          client.setArgv('integration', 'add', '/product');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Invalid format. Expected: <integration-name>/<product-slug>'
          );
        });

        it('should work with single-product integration and explicit slug', async () => {
          client.setArgv('integration', 'add', 'acme/acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          await expect(client.stderr).toOutput(
            'Terms have not been accepted. Open Vercel Dashboard?'
          );
          client.stdin.write('n\n');
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
        });
      });

      describe('errors', () => {
        it('should error when no integration arugment was passed', async () => {
          client.setArgv('integration', 'add');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: You must pass an integration slug'
          );
        });

        it('should error when more than one integration arugment was passed', async () => {
          client.setArgv('integration', 'add', 'acme', 'acme-two');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Cannot install more than one integration at a time'
          );
        });

        it('should error when integration was not found', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv('integration', 'add', 'does-not-exist');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Failed to get integration "does-not-exist": Response Error (404)'
          );
        });

        it('should track redacted [name] positional argument when integration is not found', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv('integration', 'add', 'does-not-exist');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

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
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv('integration', 'add', 'acme-external');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Integration "acme-external" is not a Marketplace integration'
          );
        });

        it('should error when integration has no products', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv('integration', 'add', 'acme-no-products');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Integration "acme-no-products" is not a Marketplace integration'
          );
        });
      });
    });
  });
});
