import { describe, expect, it } from 'vitest';
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

    it('returns formatted json output', async () => {
      useIntegrationDiscover();
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
      useIntegrationDiscover();
      client.setArgv('integration', 'discover');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Available marketplace integrations:');
      expect(stderr).toContain('Neon (neon)');
      expect(stderr).toContain(
        'Description: Serverless Postgres with branching'
      );
      expect(stderr).toContain('Products: Postgres');
    });

    it('continues when categories endpoint fails', async () => {
      useIntegrationDiscover({ categoriesStatus: 404 });
      client.setArgv('integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
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

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Error: Failed to fetch marketplace integrations: Response Error (500)'
      );
    });

    it('accepts global debug flag before command', async () => {
      useIntegrationDiscover();
      client.setArgv('--debug', 'integration', 'discover', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);
    });

    it('tracks telemetry for subcommand and --json', async () => {
      useIntegrationDiscover();
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
