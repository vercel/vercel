import { describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useIntegrationCategories } from '../../../mocks/integration';

describe('integration', () => {
  describe('categories', () => {
    describe('--help', () => {
      it('tracks telemetry', async () => {
        const command = 'integration';
        const subcommand = 'categories';

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

    it('returns formatted json output (slug + title only, no id)', async () => {
      useIntegrationCategories();
      client.setArgv('integration', 'categories', '--format=json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      const output = JSON.parse(client.stdout.getFullOutput());
      expect(output).toEqual({
        categories: [
          { slug: 'storage', title: 'Storage' },
          { slug: 'dev-tools', title: 'DevTools' },
        ],
      });
    });

    it('returns a human-readable table by default', async () => {
      useIntegrationCategories();
      client.setArgv('integration', 'categories');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Available marketplace categories:');
      expect(stderr).toContain('Slug');
      expect(stderr).toContain('Title');
      expect(stderr).toContain('storage');
      expect(stderr).toContain('Storage');
      expect(stderr).toContain('dev-tools');
      expect(stderr).toContain('DevTools');
    });

    it('errors when the categories endpoint fails', async () => {
      useIntegrationCategories({ status: 500 });
      client.setArgv('integration', 'categories', '--format=json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Error: Failed to fetch integration categories: Response Error (500)'
      );
    });

    it('errors when extra arguments are provided', async () => {
      client.setArgv('integration', 'categories', 'extra');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Invalid number of arguments. Usage: `vercel integration categories`'
      );
    });

    it('tracks telemetry for subcommand', async () => {
      useIntegrationCategories();
      client.setArgv('integration', 'categories', '--format=json');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:categories',
          value: 'categories',
        },
      ]);
    });
  });
});
