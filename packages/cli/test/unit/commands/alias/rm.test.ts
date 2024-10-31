import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import alias from '../../../../src/commands/alias';
import { useUser } from '../../../mocks/user';

describe('alias rm', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'alias';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('no argument', () => {
    it.todo('errors');
  });
  describe('[ALIAS]', () => {
    it.todo('removes the alias');

    it('tracks argument', async () => {
      useUser();
      client.scenario.get(`/now/aliases/:aliasOrId`, (request, response) => {
        response.json({});
      });
      client.scenario.delete(`/now/aliases/:id`, (request, response) => {
        response.json({});
      });
      client.setArgv('alias', 'rm', 'custom', '--yes');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code for "alias"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:rm',
          value: 'rm',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
        {
          key: 'argument:alias',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('invalid alias', () => {
      it.todo('errors');
    });

    describe('the alias cannot be found', () => {
      it.todo('errors');
    });

    describe('--yes', () => {
      it.todo('skips confirmation step');

      it('tracks flag', async () => {
        useUser();
        client.scenario.get(`/now/aliases/:aliasOrId`, (request, response) => {
          response.json({});
        });
        client.scenario.delete(`/now/aliases/:id`, (request, response) => {
          response.json({});
        });
        client.setArgv('alias', 'rm', 'custom', '--yes');
        const exitCode = await alias(client);
        expect(exitCode, 'exit code for "alias"').toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:rm',
            value: 'rm',
          },
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
          {
            key: 'argument:alias',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });
});
