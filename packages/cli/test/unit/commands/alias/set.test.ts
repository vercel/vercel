import { describe, it, expect, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDeployment } from '../../../mocks/deployment';

vi.setConfig({ testTimeout: 600000 });

describe('alias set', () => {
  describe('missing args', () => {
    it.todo('errors');
  });

  describe('invalid deployment', () => {
    it.todo('errors');
  });

  describe('invalid domain', () => {
    it.todo('errors');
  });

  describe('[deployment url] [custom domain]', () => {
    it('tracks arguments', async () => {
      const user = useUser();
      const { url } = useDeployment({ creator: user });
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:set`,
          value: 'set',
        },
        {
          key: `argument:deployment-url`,
          value: '[REDACTED]',
        },
        {
          key: `argument:custom-domain`,
          value: '[REDACTED]',
        },
      ]);
    });
    it('tracks debug flag', async () => {
      const user = useUser();
      const { url } = useDeployment({ creator: user });
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom', '--debug');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:set`,
          value: 'set',
        },
        {
          key: `argument:deployment-url`,
          value: '[REDACTED]',
        },
        {
          key: `argument:custom-domain`,
          value: '[REDACTED]',
        },
        {
          key: 'flag:debug',
          value: 'TRUE',
        },
      ]);
    });
    it('tracks local config option', async () => {
      const user = useUser();
      const { url } = useDeployment({ creator: user });
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom', '--local-config', 'config');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:set`,
          value: 'set',
        },
        {
          key: `argument:deployment-url`,
          value: '[REDACTED]',
        },
        {
          key: `argument:custom-domain`,
          value: '[REDACTED]',
        },
        {
          key: 'option:local-config',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
