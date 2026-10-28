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
      await expect(exitCodePromise).resolves.toEqual(0);

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

  describe('too many args', () => {
    it('names the deployment argument in the usage', async () => {
      useUser();
      client.setArgv('alias', 'set', 'a.vercel.app', 'b.com', 'c.com');

      await expect(alias(client)).resolves.toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        '`vercel alias <deployment> <target>` accepts at most two arguments'
      );
    });
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

    it('passes IDs unchanged to the alias endpoint', async () => {
      useUser();
      const id = 'abc123';
      let idOrUrl: string | undefined;
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          idOrUrl = request.params.id;
          response.json({});
        }
      );

      client.setArgv('alias', 'set', id, 'custom');
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(idOrUrl).toEqual(id);
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

  describe('Deployment Protection notice', () => {
    function useAliasScenario({
      ssoProtection,
      projectDomain,
    }: {
      ssoProtection: { deploymentType: string } | null;
      projectDomain?: string;
    }) {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({ alias: request.body.alias });
        }
      );
      client.scenario.get('/v9/projects/:id', (request, response) => {
        response.json({ id: request.params.id, ssoProtection });
      });
      client.scenario.get(
        '/v9/projects/:id/domains/:domain',
        (request, response) => {
          if (request.params.domain === projectDomain) {
            response.json({
              name: projectDomain,
              projectId: request.params.id,
              verified: true,
            });
            return;
          }
          response
            .status(404)
            .json({ error: { code: 'not_found', message: 'Not found' } });
        }
      );
      return deployment;
    }

    it('warns when a production alias is not a project domain under Standard Protection', async () => {
      const { url } = useAliasScenario({
        ssoProtection: { deploymentType: 'all_except_custom_domains' },
      });
      client.setArgv('alias', 'set', url, 'my-alias.vercel.app');

      await expect(alias(client)).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('now points to');
      expect(stderr).toContain(
        'Deployment Protection is on for this project (Vercel Authentication), so https://my-alias.vercel.app requires access.'
      );
      expect(stderr).toContain('vercel curl');
    });

    it('stays quiet when the alias is a project domain under Standard Protection', async () => {
      const { url } = useAliasScenario({
        ssoProtection: { deploymentType: 'all_except_custom_domains' },
        projectDomain: 'my-alias.vercel.app',
      });
      client.setArgv('alias', 'set', url, 'my-alias.vercel.app');

      await expect(alias(client)).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Deployment Protection'
      );
    });

    it('warns for a project domain when All Deployments are protected', async () => {
      const { url } = useAliasScenario({
        ssoProtection: { deploymentType: 'all' },
        projectDomain: 'my-alias.vercel.app',
      });
      client.setArgv('alias', 'set', url, 'my-alias.vercel.app');

      await expect(alias(client)).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Deployment Protection is on for this project'
      );
    });

    it('stays quiet when protection is off', async () => {
      const { url } = useAliasScenario({ ssoProtection: null });
      client.setArgv('alias', 'set', url, 'my-alias.vercel.app');

      await expect(alias(client)).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Deployment Protection'
      );
    });
  });
});
