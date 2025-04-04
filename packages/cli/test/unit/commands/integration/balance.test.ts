import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import {
  useConfiguration,
  usePrepayment,
  useResources,
} from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import createLineIterator from 'line-async-iterator';

describe('integration', () => {
  describe('balance', () => {
    beforeEach(() => {
      useUser();
    });

    describe('--help', () => {
      it('tracks telemetry', async () => {
        const command = 'integration';
        const subcommand = 'balance';

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

    describe('appropriate usage', () => {
      let team: Team;
      beforeEach(() => {
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        useConfiguration();
        useResources();
      });

      describe('[integration]', () => {
        beforeEach(() => {});

        it("returns balance and threshold values for an integration's resource", async () => {
          usePrepayment('acme-prepayment');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> Balances and thresholds for acme-prepayment:'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● store_1');
          line = await lines.next();
          expect(line.value).toEqual('>     Balance: $15.00');
          line = await lines.next();
          expect(line.value).toEqual(
            '>     Threshold: Spend $10.00 if balance goes below $10.00'
          );
        });

        it("returns balance value for an integration's resource with no thresholds", async () => {
          usePrepayment('acme-no-threshold');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> No thresholds found for this integration'
          );
          line = await lines.next();

          expect(line.value).toEqual(
            '> Balances and thresholds for acme-prepayment:'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● store_1');
          line = await lines.next();
          expect(line.value).toEqual('>     Balance: $15.00');
        });

        it("returns threshold value for an integration's resource with no balance", async () => {
          usePrepayment('acme-no-balance');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> No balances found for this integration'
          );
          line = await lines.next();

          expect(line.value).toEqual(
            '> Balances and thresholds for acme-prepayment:'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● store_1');
          line = await lines.next();
          expect(line.value).toEqual(
            '>     Threshold: Spend $10.00 if balance goes below $10.00'
          );
        });

        it('returns no balance and no threshold when both are empty', async () => {
          usePrepayment('acme-empty');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> No balances found for this integration'
          );
          line = await lines.next();
          expect(line.value).toEqual(
            '> No thresholds found for this integration'
          );
        });

        it('returns installation-level balance and threshold values for an integration', async () => {
          usePrepayment('acme-prepayment-installation-level');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> Balances and thresholds for acme-prepayment:'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● installation');
          line = await lines.next();
          expect(line.value).toEqual('>     Balance: $15.00');
          line = await lines.next();
          expect(line.value).toEqual(
            '>     Threshold: Spend $10.00 if balance goes below $10.00'
          );
        });

        it('returns balance and threshold values for an multiple resources under an integration', async () => {
          usePrepayment('acme-multiple-balances-and-thresholds');
          client.setArgv('integration', 'balance', 'acme-prepayment');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          const lines = createLineIterator(client.stderr);
          let line = await lines.next();

          expect(line.value).toEqual('Retrieving installation…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving resources…');
          line = await lines.next();
          expect(line.value).toEqual('Retrieving balance info…');
          line = await lines.next();

          expect(line.value).toEqual(
            '> Balances and thresholds for acme-prepayment:'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● store_1');
          line = await lines.next();
          expect(line.value).toEqual('>     Balance: $15.00');
          line = await lines.next();
          expect(line.value).toEqual(
            '>     Threshold: Spend $10.00 if balance goes below $10.00'
          );
          line = await lines.next();
          expect(line.value).toEqual('> ● store_2');
          line = await lines.next();
          expect(line.value).toEqual('>     Balance: $12.00');
          line = await lines.next();
          expect(line.value).toEqual(
            '>     Threshold: Spend $20.00 if balance goes below $5.00'
          );
        });
      });
    });

    describe('errors', () => {
      it('should error when there is no team', async () => {
        client.setArgv('integration', 'balance', 'acme');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integration"').toEqual(1);
        await expect(client.stderr).toOutput('Error: Team not found.');
      });

      it('should error when no argument passed', async () => {
        const teams = useTeams('team_dummy');
        const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;

        client.setArgv('integration', 'balance');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integration"').toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: You must pass an integration slug'
        );
      });

      it('should error when multiple arguments passed', async () => {
        const teams = useTeams('team_dummy');
        const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;

        client.setArgv('integration', 'balance', 'acme', 'acme2');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integration"').toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Cannot specify more than one integration at a time'
        );
      });
    });
  });
});
