import { describe, it, expect, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

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

  describe('[ID or URL]', () => {
    it('errors when the target is missing', async () => {
      useUser();
      client.setArgv('alias', 'set', 'custom');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(1);

      await expect(client.stderr).toOutput('requires two arguments');
    });
  });

  describe('[ID or URL] [custom domain]', () => {
    it('tracks arguments', async () => {
      useUser();
      const url = 'my-deployment.vercel.app';
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
  });
});
