import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useIntegrationDiscover } from '../../../mocks/integration';

describe('integration', () => {
  describe('discover', () => {
    describe('--help', () => {
      it('tracks telemetry', async () => {
        const command = 'integration';
        const subcommand = 'discover';

        client.setArgv(command, subcommand, '--help');
        const exitCode = await integrationCommand(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: `${command}:${subcommand}`,
          },
        ]);
      });
    });

    beforeEach(() => {
      useIntegrationDiscover();
    });

    it('returns formatted json output', async () => {
      client.setArgv('integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      const output = JSON.parse(client.stdout.getFullOutput());
      expect(output).toEqual({
        integrations: [
          {
            slug: 'neon',
            name: 'Neon',
            description: 'Serverless Postgres with branching',
            category: ['Storage', 'DevTools'],
            products: [{ slug: 'postgres', name: 'Postgres' }],
          },
        ],
      });
    });

    it('returns a human-readable table by default', async () => {
      client.setArgv('integration', 'discover');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      await expect(client.stderr).toOutput(
        '> Available marketplace integrations:'
      );
      await expect(client.stderr).toOutput('Neon');
      await expect(client.stderr).toOutput('Storage, DevTools');
      await expect(client.stderr).toOutput('Postgres');
    });

    it('continues when categories endpoint fails', async () => {
      useIntegrationDiscover({ categoriesStatus: 404 });
      client.setArgv('integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      await expect(client.stderr).toOutput(
        'WARN! Failed to fetch integration categories. Continuing without categories: Response Error (404)'
      );

      const output = JSON.parse(client.stdout.getFullOutput());
      expect(output).toEqual({
        integrations: [
          {
            slug: 'neon',
            name: 'Neon',
            description: 'Serverless Postgres with branching',
            category: [],
            products: [{ slug: 'postgres', name: 'Postgres' }],
          },
        ],
      });
    });

    it('errors when integrations endpoint fails', async () => {
      useIntegrationDiscover({ integrationsStatus: 500 });
      client.setArgv('integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

      await expect(client.stderr).toOutput(
        'Error: Failed to fetch marketplace integrations: Response Error (500)'
      );
    });

    it('accepts global debug flag before command', async () => {
      client.setArgv('--debug', 'integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);
    });

    it('tracks telemetry for subcommand and --json', async () => {
      client.setArgv('integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:discover',
          value: 'discover',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });
});
