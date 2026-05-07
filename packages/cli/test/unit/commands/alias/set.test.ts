import { describe, it, expect, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDeployment } from '../../../mocks/deployment';

vi.setConfig({ testTimeout: 600000 });

describe('alias set', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'alias';
      const subcommand = 'set';

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

  describe('missing args', () => {
    it.todo('errors');
  });

  describe('invalid deployment', () => {
    it.todo('errors');
  });

  describe('invalid domain', () => {
    it.todo('errors');
  });

  describe('[custom domain]', () => {
    it('tracks argument', async () => {
      const user = useUser();
      const deployment = {
        uid: 'an id',
        state: 'READY',
        creator: { uid: user.id },
        created: Date.now(),
      };
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({});
        }
      );
      client.scenario.get('/:version/now/deployments', (request, response) => {
        response.json({ deployments: [deployment] });
      });
      client.scenario.get('/:version/deployments/:id', (request, response) => {
        response.json({ deployment });
      });
      client.setArgv('alias', 'set', 'custom');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:set`,
          value: 'set',
        },
        {
          key: `argument:custom-domain`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('[deployment url] [custom domain]', () => {
    it('tracks arguments', async () => {
      const user = useUser();
      const { url } = useDeployment({ creator: user });
      let deploymentOrAliasIdOrUrl: string | undefined;
      let aliasTarget: string | undefined;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          deploymentOrAliasIdOrUrl = request.params.id;
          aliasTarget = request.body.alias;
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(deploymentOrAliasIdOrUrl).toEqual(url);
      expect(aliasTarget).toEqual('custom');

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

    it('passes source URLs through to the alias endpoint', async () => {
      useUser();
      const sourceUrl = 'https://my-alias.vercel.app';
      let deploymentOrAliasIdOrUrl: string | undefined;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          deploymentOrAliasIdOrUrl = request.params.id;
          response.json({});
        }
      );

      client.setArgv('alias', 'set', sourceUrl, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(deploymentOrAliasIdOrUrl).toEqual(sourceUrl);
    });
  });
});
