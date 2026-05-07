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

  describe('[ID or URL] [custom domain]', () => {
    it('tracks arguments', async () => {
      const user = useUser();
      const { url } = useDeployment({ creator: user });
      let idOrUrl: string | undefined;
      let aliasTarget: string | undefined;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          idOrUrl = request.params.id;
          aliasTarget = request.body.alias;
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(idOrUrl).toEqual(url);
      expect(aliasTarget).toEqual('custom');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:set`,
          value: 'set',
        },
        {
          key: `argument:id-or-url`,
          value: '[REDACTED]',
        },
        {
          key: `argument:custom-domain`,
          value: '[REDACTED]',
        },
      ]);
    });

    it('passes valid URLs as hosts to the alias endpoint', async () => {
      useUser();
      const url = 'https://my-alias.vercel.app';
      let idOrUrl: string | undefined;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          idOrUrl = request.params.id;
          response.json({});
        }
      );

      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(idOrUrl).toEqual('my-alias.vercel.app');
    });

    it('outputs the API error for invalid URLs', async () => {
      useUser();
      const url = 'https://%';
      const errorMessage = `Invalid URL "${url}"`;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          expect(request.params.id).toEqual(url);
          response.status(400).json({
            error: {
              code: 'invalid_url',
              message: errorMessage,
            },
          });
        }
      );

      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(1);
      await expect(client.stderr).toOutput(errorMessage);
    });

    it('outputs the API error for invalid IDs', async () => {
      useUser();
      const id = 'not-a-valid-id';
      const errorMessage = `Invalid ID "${id}"`;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          expect(request.params.id).toEqual(id);
          response.status(400).json({
            error: {
              code: 'invalid_deployment_id',
              message: errorMessage,
            },
          });
        }
      );

      client.setArgv('alias', 'set', id, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(1);
      await expect(client.stderr).toOutput(errorMessage);
    });

    it('outputs the API error for URLs that are not found', async () => {
      useUser();
      const url = 'https://missing-alias.vercel.app';
      const host = 'missing-alias.vercel.app';
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          expect(request.params.id).toEqual(host);
          response.status(404).json({
            error: {
              code: 'not_found',
              message: 'Not found',
            },
          });
        }
      );

      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(1);
      await expect(client.stderr).toOutput(`Failed to find ID or URL ${host}`);
    });
  });
});
