import chalk from 'chalk';
import { describe, it, expect, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDeployment } from '../../../mocks/deployment';
import { defaultProject, useProject } from '../../../mocks/project';
import type { LastAliasRequest } from '@vercel-internals/types';

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
      useProject();
      const { url } = useDeployment({ creator: user });
      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          response.json({});
        }
      );
      client.setArgv('alias', 'set', url, 'custom');
      const exitCode = await alias(client);
      expect(exitCode, 'exit code of "alias"').toEqual(0);

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
  });

  describe('production alias detection', () => {
    it('uses promote flow when alias target matches production alias', async () => {
      const user = useUser();
      const productionAlias = 'my-app.vercel.app';
      const { project } = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
        targets: {
          production: {
            ...defaultProject.targets?.production,
            alias: [productionAlias],
          } as any,
        },
      });

      const deployment = useDeployment({
        creator: user,
        project,
        target: 'production',
      });

      let promoteEndpointCalled = false;
      let lastAliasRequest: LastAliasRequest | null = null;

      client.scenario.post(
        '/:version/projects/:project/promote/:id',
        (req, res) => {
          promoteEndpointCalled = true;
          const { id } = req.params;

          lastAliasRequest = {
            fromDeploymentId: 'old-deploy',
            jobStatus: 'succeeded',
            requestedAt: Date.now(),
            toDeploymentId: id,
            type: 'promote',
          };

          Object.defineProperty(project, 'lastAliasRequest', {
            get(): LastAliasRequest | null {
              return lastAliasRequest;
            },
            configurable: true,
          });

          res.statusCode = 201;
          res.end();
        }
      );

      client.setArgv('alias', 'set', deployment.url, productionAlias);
      const exitCodePromise = alias(client);

      await expect(client.stderr).toOutput(
        `Alias ${chalk.bold(productionAlias)} is a production alias. Using promote flow.`
      );
      await expect(client.stderr).toOutput(
        `Success! ${chalk.bold(project.name)} was promoted to`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(promoteEndpointCalled).toBe(true);
    });

    it('uses regular alias flow when alias target is not a production alias', async () => {
      const user = useUser();
      const productionAlias = 'my-app.vercel.app';
      const customAlias = 'custom-alias.vercel.app';
      const { project } = useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
        targets: {
          production: {
            ...defaultProject.targets?.production,
            alias: [productionAlias],
          } as any,
        },
      });

      const deployment = useDeployment({
        creator: user,
        project,
        target: 'production',
      });

      let regularAliasEndpointCalled = false;
      let promoteEndpointCalled = false;

      client.scenario.post(
        '/:version/deployments/:id/aliases',
        (request, response) => {
          regularAliasEndpointCalled = true;
          response.json({ alias: customAlias });
        }
      );

      client.scenario.post(
        '/:version/projects/:project/promote/:id',
        (req, res) => {
          promoteEndpointCalled = true;
          res.statusCode = 201;
          res.end();
        }
      );

      client.setArgv('alias', 'set', deployment.url, customAlias);
      const exitCode = await alias(client);

      expect(exitCode, 'exit code of "alias"').toEqual(0);
      expect(regularAliasEndpointCalled).toBe(true);
      expect(promoteEndpointCalled).toBe(false);
    });
  });
});
