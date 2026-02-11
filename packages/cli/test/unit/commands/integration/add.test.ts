import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import pull from '../../../../src/commands/env/pull';
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

vi.mock('../../../../src/commands/env/pull', () => {
  return {
    default: vi.fn().mockResolvedValue(0),
  };
});

const openMock = vi.mocked(open);
const pullMock = vi.mocked(pull);

beforeEach(() => {
  openMock.mockClear();
  pullMock.mockClear();
  // Mock Math.random to get predictable resource names (gray-apple suffix)
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
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

        it('should show usage examples for metadata fields in dynamic help', async () => {
          client.setArgv('integration', 'add', 'acme-full-schema', '--help');
          const exitCode = await integrationCommand(client);
          expect(exitCode).toEqual(0);
          const output = client.getFullOutput();
          // String field with options should show first option
          expect(output).toContain('Example:');
          expect(output).toContain('-m region=iad1');
          // Boolean field
          expect(output).toContain('-m auth=true');
          // Array field with options should show first two options
          expect(output).toContain('-m "readRegions=iad1,sfo1"');
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
            'Terms have not been accepted. Open Vercel Dashboard? (Y/n)'
          );
          client.stdin.write('y\n');
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&projectId=vercel-integration-add&defaultResourceName=acme-gray-apple&cmd=add'
          );
        });

        it('should not include projectId in URL with --no-connect flag', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme', '--no-connect');
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&defaultResourceName=acme-gray-apple&cmd=add'
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&defaultResourceName=acme-gray-apple&cmd=add'
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
              key: 'argument:integration',
              value: 'acme',
            },
          ]);
        });

        it('should include custom --name in URL when fallback to browser without project', async () => {
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--name',
            'my-custom-db'
          );
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&defaultResourceName=my-custom-db&cmd=add'
          );
        });

        it('should forward --metadata to browser fallback URL when no installation', async () => {
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=us-east-1'
          );
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
          const calledUrl = openMock.mock.calls[0]?.[0] as string;
          const parsed = new URL(calledUrl);
          expect(parsed.searchParams.get('metadata')).toEqual(
            JSON.stringify({ region: 'us-east-1' })
          );
          expect(parsed.searchParams.get('source')).toEqual('cli');
          expect(parsed.searchParams.get('cmd')).toEqual('add');
        });

        it('should include custom --name and projectId in URL when project is linked', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme', '--name', 'my-proj-db');
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&projectId=vercel-integration-add&defaultResourceName=my-proj-db&cmd=add'
          );
        });

        it('should not include projectId in URL with --no-connect and custom --name', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--name',
            'my-nolink-db',
            '--no-connect'
          );
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
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&defaultResourceName=my-nolink-db&cmd=add'
          );
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: acme-gray-apple
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
          );
          await expect(client.stderr).toOutput('Dashboard:');
          await expect(client.stderr).toOutput(
            'acme-gray-apple successfully connected to vercel-integration-add'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
          expect(pullMock).toHaveBeenCalledWith(
            client,
            ['--yes'],
            'vercel-cli:integration:add'
          );
        });

        it('should warn when env pull fails', async () => {
          pullMock.mockResolvedValueOnce(1);
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection? (Y/n)');
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
          );
          await expect(client.stderr).toOutput(
            'acme-gray-apple successfully connected to vercel-integration-add'
          );
          await expect(client.stderr).toOutput(
            'Failed to pull environment variables. You can run `vercel env pull` manually.'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(pullMock).toHaveBeenCalledWith(
            client,
            ['--yes'],
            'vercel-cli:integration:add'
          );
        });

        it('should skip connecting with --no-connect flag', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme', '--no-connect');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

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
- Name: acme-gray-apple
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
          );
          await expect(client.stderr).toOutput('Dashboard:');
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
          expect(pullMock).not.toHaveBeenCalled();
        });

        it('should skip env pull with --no-env-pull flag', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-add',
            name: 'vercel-integration-add',
          });
          const cwd = setupUnitFixture('vercel-integration-add');
          client.cwd = cwd;
          client.setArgv('integration', 'add', 'acme', '--no-env-pull');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

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
- Name: acme-gray-apple
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
          );
          await expect(client.stderr).toOutput('Dashboard:');
          await expect(client.stderr).toOutput(
            'acme-gray-apple successfully connected to vercel-integration-add'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          expect(openMock).not.toHaveBeenCalled();
          expect(pullMock).not.toHaveBeenCalled();
        });

        it('should handle provisioning resource without project context', async () => {
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

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
- Name: acme-gray-apple
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
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
            'This resource must be provisioned through the Web UI. Open Vercel Dashboard?'
          );
          client.stdin.write('Y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&source=cli&projectId=vercel-integration-add&defaultResourceName=acme-gray-apple&cmd=add'
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'You have selected a plan that cannot be provisioned through the CLI. Open \nVercel Dashboard?'
          );
          client.stdin.write('Y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          const calledUrl = openMock.mock.calls[0]?.[0] as string;
          const parsed = new URL(calledUrl);
          expect(parsed.searchParams.get('teamId')).toEqual('team_dummy');
          expect(parsed.searchParams.get('integrationId')).toEqual(
            'acme-prepayment'
          );
          expect(parsed.searchParams.get('productId')).toEqual('acme-product');
          expect(parsed.searchParams.get('source')).toEqual('cli');
          expect(parsed.searchParams.get('defaultResourceName')).toEqual(
            'acme-gray-apple'
          );
          expect(parsed.searchParams.get('cmd')).toEqual('add');
          // Wizard-collected metadata is forwarded to the browser
          expect(parsed.searchParams.get('metadata')).toEqual(
            JSON.stringify({ region: 'us-west-1' })
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: acme-gray-apple
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: acme-gray-apple'
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: acme-gray-apple
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
            'Acme Product successfully provisioned: acme-gray-apple'
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: acme-gray-apple
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
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            `Selected product:
- Name: acme-gray-apple
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

      describe('--name flag', () => {
        beforeEach(() => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
        });

        it('should use provided resource name from --name flag', async () => {
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--name',
            'my-custom-name'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

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
- Name: my-custom-name
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: my-custom-name'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
        });

        it('should reject invalid resource name from --name flag', async () => {
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--name',
            'Invalid.Name@123'
          );
          const exitCode = await integrationCommand(client);

          await expect(client.stderr).toOutput(
            'Error: Resource name can only contain letters, numbers, underscores, and hyphens'
          );
          expect(exitCode).toEqual(1);
        });

        it('should reject empty resource name from --name flag', async () => {
          client.setArgv('integration', 'add', 'acme', '--name', '   ');
          const exitCode = await integrationCommand(client);

          await expect(client.stderr).toOutput(
            'Error: Resource name cannot be empty'
          );
          expect(exitCode).toEqual(1);
        });

        it('should reject resource name exceeding 128 characters', async () => {
          const longName = 'a'.repeat(129);
          client.setArgv('integration', 'add', 'acme', '--name', longName);
          const exitCode = await integrationCommand(client);

          await expect(client.stderr).toOutput(
            'Error: Resource name cannot exceed 128 characters'
          );
          expect(exitCode).toEqual(1);
        });

        it('should accept -n shorthand for --name flag', async () => {
          client.setArgv('integration', 'add', 'acme', '-n', 'shorthand-name');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

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
- Name: shorthand-name
- Primary Region: us-west-1
- Plan: Pro Plan
? Confirm selection? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Validating payment...');
          await expect(client.stderr).toOutput('Validation complete.');
          await expect(client.stderr).toOutput(
            'Acme Product successfully provisioned: shorthand-name'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
        });

        it('should accept exactly 128 character resource name', async () => {
          const maxName = 'a'.repeat(128);
          client.setArgv('integration', 'add', 'acme', '--name', maxName);
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );

          await expect(client.stderr).toOutput(
            'Choose your region (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'Choose a billing plan (Use arrow keys)'
          );
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(`- Name: ${maxName}`);
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput(
            `Acme Product successfully provisioned: ${maxName}`
          );
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
        });

        it('should reject --name that violates aws-apg product-specific rules (must start with letter)', async () => {
          client.setArgv(
            'integration',
            'add',
            'aws-apg',
            '--name',
            '1starts-with-number'
          );
          const exitCode = await integrationCommand(client);

          await expect(client.stderr).toOutput(
            'Error: Resource name must start with a letter and can only contain letters, numbers, and hyphens'
          );
          expect(exitCode).toEqual(1);
        });

        it('should reject --name exceeding aws-apg 50-char limit', async () => {
          const longName = 'a'.repeat(51);
          client.setArgv('integration', 'add', 'aws-apg', '--name', longName);
          const exitCode = await integrationCommand(client);

          await expect(client.stderr).toOutput(
            'Error: Resource name cannot exceed 50 characters'
          );
          expect(exitCode).toEqual(1);
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
              key: 'argument:integration',
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

      describe('--metadata flag', () => {
        it('should error on invalid metadata value before prompting for resource name', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=invalid-region'
          );
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Metadata "region" must be one of: us-west-1, us-east-1'
          );
          // Should NOT prompt for resource name since validation fails first
          await expect(client.stderr).not.toOutput(
            'What is the name of the resource?'
          );
        });

        it('should error on invalid metadata even when CLI provisioning not supported (no installation)', async () => {
          useIntegration({ withInstallation: false });
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=invalid-region'
          );
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Metadata "region" must be one of: us-west-1, us-east-1'
          );
          // Should NOT fall through to web UI with invalid metadata
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should error on unknown metadata key', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'unknown=value'
          );
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Unknown metadata key: "unknown"'
          );
        });

        it('should error on invalid metadata format', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'no-equals-sign'
          );
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Invalid metadata format: "no-equals-sign". Expected KEY=VALUE'
          );
        });

        it('should accept valid metadata and skip wizard prompts', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=us-east-1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          // Auto-generated name, --metadata provides metadata — skip wizard, go to billing
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should error in non-TTY mode without --metadata flag when required fields have no defaults', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          client.stdin.isTTY = false;
          client.setArgv('integration', 'add', 'acme-required');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            "Error: Metadata is required in non-interactive mode. Use --metadata KEY=VALUE flags. Run 'vercel integration add <name> --help' to see available keys."
          );
        });

        it('should skip metadata error in non-TTY mode when all required fields have defaults', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.stdin.isTTY = false;
          client.setArgv('integration', 'add', 'acme');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          // Should NOT error about metadata — all required fields have defaults
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should work in non-TTY mode with valid --metadata flag', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.stdin.isTTY = false;
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=us-east-1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Integration under ${team.slug}`
          );
          // --metadata skips the wizard, but billing plan selection and confirmation
          // still require interactive prompts (no --plan flag yet). The mock client
          // processes stdin writes regardless of isTTY, so this tests metadata bypass
          // rather than full non-interactive provisioning.
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should enable CLI provisioning with --metadata even when wizard not supported', async () => {
          // acme-unsupported has a schema with expressions that wizard can't handle
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.setArgv(
            'integration',
            'add',
            'acme-unsupported',
            '--metadata',
            'region=us-east-1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput('Installing Acme Product');
          // Should NOT fall back to web UI since --metadata provided
          // Auto-generated name, --metadata provides metadata — skip wizard, go to billing
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
          // Should NOT have opened browser
          expect(openMock).not.toHaveBeenCalled();
        });

        it('should track metadata telemetry when --metadata is used', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.setArgv(
            'integration',
            'add',
            'acme',
            '--metadata',
            'region=us-east-1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:add',
              value: 'add',
            },
            {
              key: 'option:metadata',
              value: '[REDACTED]',
            },
            {
              key: 'argument:integration',
              value: 'acme',
            },
          ]);
        });

        it('should pre-fill wizard with partial --metadata and prompt for remaining fields', async () => {
          // acme-multi has two interactive fields: version (select) and region (vercel-region)
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.setArgv(
            'integration',
            'add',
            'acme-multi',
            '--metadata',
            'region=pdx1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            `Installing Acme Product by Acme Multi under ${team.slug}`
          );
          // Wizard should prompt for version (not pre-filled) but NOT for region (pre-filled)
          await expect(client.stderr).toOutput('Version');
          client.stdin.write('\n'); // select default version
          // Should skip region prompt and go to billing
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput('Confirm selection?');
          client.stdin.write('y\n');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should forward --metadata to browser URL when prepayment plan selected', async () => {
          useIntegration({ withInstallation: true, ownerId: team.id });
          usePreauthorization();
          client.setArgv(
            'integration',
            'add',
            'acme-prepayment',
            '--metadata',
            'region=us-east-1'
          );
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput('Choose a billing plan');
          client.stdin.write('\n');
          await expect(client.stderr).toOutput(
            'You have selected a plan that cannot be provisioned through the CLI. Open \nVercel Dashboard?'
          );
          client.stdin.write('y\n');
          const exitCode = await exitCodePromise;
          expect(exitCode).toEqual(0);
          const calledUrl = openMock.mock.calls[0]?.[0] as string;
          const parsed = new URL(calledUrl);
          expect(parsed.searchParams.get('metadata')).toEqual(
            JSON.stringify({ region: 'us-east-1' })
          );
        });
      });
    });
  });
});
