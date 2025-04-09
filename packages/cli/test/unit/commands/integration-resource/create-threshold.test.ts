import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { usePrepayment, useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('integration-resource', () => {
  describe('create-threshold', () => {
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

      it('should exit early if specified resource is not found', async () => {
        const resourceName = 'not-found';

        client.setArgv(
          'integration-resource',
          'create-threshold',
          resourceName,
          '10',
          '10',
          '10000'
        );
        const exitCodePromise = integrationResourceCommand(client);

        await expect(client.stderr).toOutput('Retrieving resource…');

        await expect(client.stderr).toOutput(
          `The resource ${resourceName} was not found.`
        );
        await expect(exitCodePromise).resolves.toEqual(0);
      });

      describe('resource-level threshold', () => {
        beforeEach(() => {
          mockUpdateThreshold();
        });

        it('should create a threshold for a resource with confirmation', async () => {
          usePrepayment('acme-empty');

          const resourceName = 'store-acme-prepayment';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the resource \n${resourceName} with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            `Success! Threshold for resource ${resourceName} created successfully.`
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should exit early if the resource has an existing threshold they do not want to overwrite', async () => {
          usePrepayment('acme-no-balance');

          const resourceName = 'store-acme-prepayment';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} already has a threshold. (minimum: $10, \nspend: $10, limit: $50). Do you want to overwrite it? (Y/n)`
          );
          client.stdin.write('n\n');

          await expect(client.stderr).toOutput('Aborting…');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should overwrite an existing resource threshold for a resource with confirmation', async () => {
          usePrepayment('acme-no-balance');

          const resourceName = 'store-acme-prepayment';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} already has a threshold. (minimum: $10, \nspend: $10, limit: $50). Do you want to overwrite it? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the resource \n${resourceName} with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            `Success! Threshold for resource ${resourceName} created successfully.`
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should exit early if the resource has a balance below the provided minimum the user chooses to abort', async () => {
          usePrepayment('acme-no-threshold');

          const resourceName = 'store-acme-prepayment';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            'The minimum threshold is higher than the current balance of $15. Are you sure?\n (Y/n)'
          );
          client.stdin.write('n\n');

          await expect(client.stderr).toOutput('Aborting…');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should set a threshold for a resource with a minimum threshold above the current balance with confirmation', async () => {
          usePrepayment('acme-no-threshold');

          const resourceName = 'store-acme-prepayment';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            'The minimum threshold is higher than the current balance of $15. Are you sure?\n (Y/n)'
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the resource \n${resourceName} with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            `Success! Threshold for resource ${resourceName} created successfully.`
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should skip all confirmation prompts when using the `--yes` flag when creating a resource threshold', async () => {
          usePrepayment('acme-prepayment');

          const resourceName = 'store-acme-prepayment';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit,
            '--yes'
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');
          await expect(client.stderr).toOutput('Creating threshold…');

          await expect(client.stderr).toOutput(
            `Success! Threshold for resource ${resourceName} created successfully.`
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });
      });

      describe('installation-level threshold', () => {
        beforeEach(() => {
          mockUpdateInstallationThreshold();
        });

        it('should create a threshold for an installation with confirmation', async () => {
          usePrepayment('acme-empty');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');
          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the installation Acme \nPrepayment with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            'Success! Threshold for installation Acme Prepayment created successfully.'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should exit early if the user says no to the final confirmation of resource threshold creation', async () => {
          usePrepayment('acme-empty');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');
          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the installation Acme \nPrepayment with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('n\n');

          await expect(client.stderr).toOutput('Aborting…');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should exit early if the resource uses an installation-level threshold and has an existing threshold they do not want to overwrite', async () => {
          usePrepayment('acme-prepayment-installation-level');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            'The installation Acme Prepayment already has a threshold. (minimum: $10, \nspend: $10, limit: $50). Do you want to overwrite it? (Y/n)'
          );
          client.stdin.write('n\n');

          await expect(client.stderr).toOutput('Aborting…');
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should overwrite an existing installation threshold for a resource with confirmation', async () => {
          usePrepayment('acme-prepayment-installation-level');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '10';
          const spend = '100';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            'The installation Acme Prepayment already has a threshold. (minimum: $10, \nspend: $10, limit: $50). Do you want to overwrite it? (Y/n)'
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the installation Acme \nPrepayment with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            'Success! Threshold for installation Acme Prepayment created successfully.'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should exit early if the resource uses an installation-level balance and has a balance below the provided minimum the user chooses to abort', async () => {
          usePrepayment('acme-prepayment-installation-level-no-threshold');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');
          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            'The minimum threshold is higher than the current balance of $15. Are you sure?\n (Y/n)'
          );
          client.stdin.write('n\n');

          await expect(client.stderr).toOutput('Aborting…');

          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should set a threshold for an installation with a minimum threshold above the current balance with confirmation', async () => {
          usePrepayment('acme-prepayment-installation-level-no-threshold');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput(
            'The minimum threshold is higher than the current balance of $15. Are you sure?\n (Y/n)'
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput(
            `Are you sure you want to create a threshold for the installation Acme \nPrepayment with minimum $${minimum}, spend $${spend}, and limit $${limit}? (Y/n)`
          );
          client.stdin.write('y\n');

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            'Success! Threshold for installation Acme Prepayment created successfully.'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });

        it('should skip all confirmation prompts when using the `--yes` flag when creating an installation threshold', async () => {
          usePrepayment('acme-prepayment-installation-level');

          const resourceName = 'store-acme-prepayment-installation';
          const minimum = '500';
          const spend = '1000';
          const limit = '10000';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit,
            '--yes'
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');
          await expect(client.stderr).toOutput('Retrieving balance info…');

          await expect(client.stderr).toOutput(
            `The resource ${resourceName} uses an installation-level balance.`
          );

          await expect(client.stderr).toOutput('Creating threshold…');
          await expect(client.stderr).toOutput(
            'Success! Threshold for installation Acme Prepayment created successfully.'
          );
          await expect(exitCodePromise).resolves.toEqual(0);
        });
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

        it('should error when too few arguments passed', async () => {
          client.setArgv(
            'integration-resource',
            'create-threshold',
            'acme-resource',
            '10',
            '10'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Missing arguments. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when too many arguments passed', async () => {
          client.setArgv(
            'integration-resource',
            'create-threshold',
            'acme-resource',
            '10',
            '10',
            '10000',
            'foo'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Too many arguments. See `--help` for details.'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when minimum is not a number', async () => {
          client.setArgv(
            'integration-resource',
            'create-threshold',
            'acme-resource',
            'minimum',
            '10',
            '10000'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Minimum is an invalid number format. Spend must be a positive number (ex. "5.75")'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when spend is not a number', async () => {
          client.setArgv(
            'integration-resource',
            'create-threshold',
            'acme-resource',
            '10',
            'spend',
            '10000'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Spend is an invalid number format. Spend must be a positive number (ex. "10.99").'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when limit is not a number', async () => {
          client.setArgv(
            'integration-resource',
            'create-threshold',
            'acme-resource',
            '10',
            '10',
            'limit'
          );
          const exitCodePromise = integrationResourceCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Limit is an invalid number format. Limit must be a positive number (ex. "1000").'
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });

      it('should error when the specified spend is less than the minimum', async () => {
        const resourceName = 'store-acme-prepayment';
        const minimum = '10.00';
        const spend = '5.00';
        const limit = '1000.00';

        client.setArgv(
          'integration-resource',
          'create-threshold',
          resourceName,
          minimum,
          spend,
          limit
        );
        const exitCodePromise = integrationResourceCommand(client);
        await expect(client.stderr).toOutput(
          'Error: Minimum cannot be greater than spend.'
        );
        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('should error when the specified minimum is greater than the limit', async () => {
        const resourceName = 'store-acme-prepayment';
        const minimum = '100.00';
        const spend = '100.00';
        const limit = '50.00';

        client.setArgv(
          'integration-resource',
          'create-threshold',
          resourceName,
          minimum,
          spend,
          limit
        );
        const exitCodePromise = integrationResourceCommand(client);
        await expect(client.stderr).toOutput(
          'Error: Minimum cannot be greater than limit.'
        );
        await expect(exitCodePromise).resolves.toEqual(1);
      });

      it('should error when the specified spend is greater than the limit', async () => {
        const resourceName = 'store-acme-prepayment';
        const minimum = '10.00';
        const spend = '100.00';
        const limit = '50.00';

        client.setArgv(
          'integration-resource',
          'create-threshold',
          resourceName,
          minimum,
          spend,
          limit
        );
        const exitCodePromise = integrationResourceCommand(client);
        await expect(client.stderr).toOutput(
          'Error: Limit cannot be less than spend.'
        );
        await expect(exitCodePromise).resolves.toEqual(1);
      });

      describe('with team', () => {
        let team: Team;
        beforeEach(() => {
          const teams = useTeams('team_dummy');
          team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
          useResources();
        });

        it('should error when specified resource does not have an integration configuration', async () => {
          const resourceName = 'foobar';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            '10',
            '10',
            '10000'
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');

          await expect(client.stderr).toOutput(
            `Error: The resource ${resourceName} does not have an integration configuration.`
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when specified resource is not a prepayment-based resource', async () => {
          const resourceName = 'store-acme-connected-project';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            '10',
            '10',
            '10000'
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');

          await expect(client.stderr).toOutput(
            `Error: The resource ${resourceName} is not a prepayment-based resource.`
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when the specified spend is less than the billing plan minimum', async () => {
          const resourceName = 'store-acme-prepayment_min_max_50';
          const minimum = '2.00';
          const spend = '5.00';
          const limit = '1000.00';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');

          await expect(client.stderr).toOutput(
            "Error: The spend amount $5 is below your billing plan's minimum amount of $50."
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });

        it('should error when the specified spend is greater than the billing plan maximum', async () => {
          const resourceName = 'store-acme-prepayment_min_max_50';
          const minimum = '2.00';
          const spend = '500.00';
          const limit = '1000.00';

          client.setArgv(
            'integration-resource',
            'create-threshold',
            resourceName,
            minimum,
            spend,
            limit
          );
          const exitCodePromise = integrationResourceCommand(client);

          await expect(client.stderr).toOutput('Retrieving resource…');

          await expect(client.stderr).toOutput(
            "Error: The spend amount $500 is above your billing plan's maximum amount of $50"
          );
          await expect(exitCodePromise).resolves.toEqual(1);
        });
      });
    });
  });
});

function mockUpdateThreshold() {
  client.scenario.post(
    '/:version/integrations/installations/:installationId/resources/:resourceId/billing/threshold',
    (_req, res) => {
      res.status(204);
      res.end();
    }
  );
}

function mockUpdateInstallationThreshold() {
  client.scenario.post(
    '/:version/integrations/installations/:installationId/billing/threshold/batch',
    (_req, res) => {
      res.status(204);
      res.end();
    }
  );
}
