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
        products: [
          {
            name: 'Neon Postgres',
            slug: 'neon',
            provider: 'Neon',
            description: 'Serverless Postgres database',
            tags: ['Storage', 'DevTools', 'Postgres'],
          },
          {
            name: 'Acme KV',
            slug: 'acme-multi/acme-kv',
            provider: 'Acme Multi',
            description: 'Key-value store',
            tags: ['Storage', 'Redis'],
          },
          {
            name: 'Acme DB',
            slug: 'acme-multi/acme-db',
            provider: 'Acme Multi',
            description: 'Relational database',
            tags: ['Storage', 'Postgres'],
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
      expect(stderr).toContain('Available marketplace products:');
      expect(stderr).toContain('Neon Postgres (neon)');
      expect(stderr).toContain('Provider: Neon');
      expect(stderr).toContain('Description: Serverless Postgres database');
      expect(stderr).toContain('Acme KV (acme-multi/acme-kv)');
      expect(stderr).toContain('Acme DB (acme-multi/acme-db)');
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
        products: [
          {
            name: 'Neon Postgres',
            slug: 'neon',
            provider: 'Neon',
            description: 'Serverless Postgres database',
            tags: ['databases', 'dev_tools', 'Postgres'],
          },
          {
            name: 'Acme KV',
            slug: 'acme-multi/acme-kv',
            provider: 'Acme Multi',
            description: 'Key-value store',
            tags: ['databases', 'Redis'],
          },
          {
            name: 'Acme DB',
            slug: 'acme-multi/acme-db',
            provider: 'Acme Multi',
            description: 'Relational database',
            tags: ['databases', 'Postgres'],
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

    describe('search term filtering', () => {
      it('filters products by name', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'neon', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(1);
        expect(output.products[0].name).toBe('Neon Postgres');
      });

      it('filters products by provider', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'acme', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(2);
        expect(output.products.map((p: { name: string }) => p.name)).toEqual([
          'Acme KV',
          'Acme DB',
        ]);
      });

      it('filters products by description', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'key-value', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(1);
        expect(output.products[0].name).toBe('Acme KV');
      });

      it('filters products by tag', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'postgres', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(2);
        expect(output.products.map((p: { name: string }) => p.name)).toEqual([
          'Neon Postgres',
          'Acme DB',
        ]);
      });

      it('is case-insensitive', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'NEON', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(1);
        expect(output.products[0].name).toBe('Neon Postgres');
      });

      it('shows message when no products match the search term', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', 'nonexistent');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const stderr = client.stderr.getFullOutput();
        expect(stderr).toContain(
          'No marketplace products matching "nonexistent" found.'
        );
      });

      it('returns all products when no search term is provided', async () => {
        useIntegrationDiscover();
        client.setArgv('integration', 'discover', '--json');
        const exitCode = await integrationCommand(client);
        expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

        const output = JSON.parse(client.stdout.getFullOutput());
        expect(output.products).toHaveLength(3);
      });
    });

    it('errors when too many arguments are provided', async () => {
      client.setArgv('integration', 'discover', 'arg1', 'arg2');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Invalid number of arguments. Usage: `vercel integration discover [query]`'
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

    it('tracks telemetry for search term argument', async () => {
      useIntegrationDiscover();
      client.setArgv('integration', 'discover', 'postgres', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:discover',
          value: 'discover',
        },
        {
          key: 'argument:query',
          value: '[REDACTED]',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });
});
