import chalk from 'chalk';
import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import promote from '../../../../src/commands/promote';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useDeployment } from '../../../mocks/deployment';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import sleep from '../../../../src/util/sleep';
import type { Deployment, LastAliasRequest } from '@vercel-internals/types';

vi.setConfig({ testTimeout: 60000 });

const projectName = 'vercel-promote';

describe('promote', () => {
  describe('[deployment id/url]', () => {
    describe('telemetry', () => {
      it('tracks usage', async () => {
        const { cwd, previousDeployment } = initPromoteTest();
        client.cwd = cwd;
        client.setArgv(
          'rollback',
          previousDeployment.id,
          '--timeout',
          '0',
          '--yes'
        );
        const exitCode = await promote(client);
        expect(exitCode, 'exit code for "promote"').toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
          {
            key: 'option:timeout',
            value: '[TIME]',
          },
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    it('should error if timeout is invalid', async () => {
      const { cwd } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', '--yes', '--timeout', 'foo');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput('Error: Invalid timeout "foo"');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should error if invalid deployment ID', async () => {
      const { cwd } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', '????', '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        'Error: The provided argument "????" is not a valid deployment ID or URL'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should error if deployment not found', async () => {
      const { cwd } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', 'foo', '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput('Fetching deployment "foo" in ');
      await expect(client.stderr).toOutput(
        'Error: Error: Can\'t find the deployment "foo" under the context'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should show status when not promoting', async () => {
      const { cwd } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        'Checking promotion status of vercel-promote'
      );
      await expect(client.stderr).toOutput(
        'No deployment promotion in progress'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:yes', value: 'TRUE' },
        {
          key: 'subcommand:status',
          value: 'status',
        },
      ]);
    });

    it('should promote by deployment id', async () => {
      const { cwd, previousDeployment } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.id, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Promote in progress');
      await expect(client.stderr).toOutput(
        `Success! ${chalk.bold(projectName)} was promoted to ${
          previousDeployment.url
        } (${previousDeployment.id})`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
    });

    it('should promote by deployment url', async () => {
      const { cwd, previousDeployment } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.url, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.url}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Promote in progress');
      await expect(client.stderr).toOutput(
        `Success! ${chalk.bold(projectName)} was promoted to ${
          previousDeployment.url
        } (${previousDeployment.id})`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
    });

    it('should fail to promote a preview deployment when user says no', async () => {
      const { cwd, previousDeployment } = initPromoteTest({
        deploymentTarget: null,
      });
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.url);
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.url}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput(
        '? This deployment is not a production deployment and cannot be directly \n' +
          'promoted. A new deployment will be built using your production environment. Are \n' +
          'you sure you want to continue? (y/N)'
      );

      // say "no" to the prompt
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Error: Canceled');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
    });

    it('should promote a preview deployment when user says yes', async () => {
      const inspectorUrl = `https://vercel.com/user/${projectName}/abcdefghijlmo`;

      const { cwd, previousDeployment } = initPromoteTest({
        deploymentTarget: null,
      });
      let createWasCalled = false;

      client.scenario.post('/v13/deployments', (req, res) => {
        createWasCalled = true;
        expect(req.body).toMatchObject({
          deploymentId: previousDeployment.id,
          name: projectName,
          target: 'production',
          meta: {
            action: 'promote',
          },
        });
        res.json({
          id: 'some-id',
          inspectorUrl,
        });
      });

      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.url);
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.url}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput(
        '? This deployment is not a production deployment and cannot be directly \n' +
          'promoted. A new deployment will be built using your production environment. Are \n' +
          'you sure you want to continue? (y/N)'
      );

      // say "yes" to the prompt
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Successfully created new deployment of ${projectName} at ${inspectorUrl}`
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
      expect(createWasCalled).toBe(true);
    });

    it('should promote a preview deployment with --yes', async () => {
      const inspectorUrl = `https://vercel.com/user/${projectName}/abcdefghijlmo`;

      let createWasCalled = false;
      const { cwd, previousDeployment } = initPromoteTest({
        deploymentTarget: null,
      });

      client.scenario.post('/v13/deployments', (req, res) => {
        createWasCalled = true;
        expect(req.body).toMatchObject({
          deploymentId: previousDeployment.id,
          name: projectName,
          target: 'production',
          meta: {
            action: 'promote',
          },
        });
        res.json({
          id: 'some-id',
          inspectorUrl,
        });
      });

      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.url, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Successfully created new deployment of ${projectName} at ${inspectorUrl}`
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
      expect(createWasCalled).toBe(true);
    });

    it('should get status while promoting', async () => {
      const { cwd, previousDeployment, project } = initPromoteTest({
        promotePollCount: 10,
      });
      client.cwd = cwd;

      // start the promote
      client.setArgv('promote', previousDeployment.id, '--yes');
      promote(client);

      // need to wait for the promote request to be accepted
      await sleep(300);

      // get the status
      client.setArgv('promote', '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Checking promotion status of ${project.name}`
      );
      await expect(client.stderr).toOutput(
        `Success! ${chalk.bold(projectName)} was promoted to ${
          previousDeployment.url
        } (${previousDeployment.id})`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
    });

    it('should error if promote request fails', async () => {
      const { cwd, previousDeployment } = initPromoteTest({
        promotePollCount: 10,
        promoteStatusCode: 500,
      });
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.id, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );

      await expect(client.stderr).toOutput('Response Error (500)');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should error if promote fails (no aliases)', async () => {
      const { cwd, previousDeployment } = initPromoteTest({
        promoteJobStatus: 'failed',
      });
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.id, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Promote in progress');
      await expect(client.stderr).toOutput(
        `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should error if promote fails (with aliases)', async () => {
      const { cwd, previousDeployment } = initPromoteTest({
        promoteAliases: [
          {
            alias: { alias: 'foo', deploymentId: 'foo_123' },
            status: 'completed',
          },
          {
            alias: { alias: 'bar', deploymentId: 'bar_123' },
            status: 'failed',
          },
        ],
        promoteJobStatus: 'failed',
      });
      client.cwd = cwd;
      client.setArgv('promote', previousDeployment.id, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Promote in progress');
      await expect(client.stderr).toOutput(
        `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
      );
      await expect(client.stderr).toOutput(
        `  ${chalk.green('completed')}    foo (foo_123)`
      );
      await expect(client.stderr).toOutput(
        `  ${chalk.red('failed')}       bar (bar_123)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should error if deployment times out', async () => {
      const { cwd, previousDeployment } = initPromoteTest({
        promotePollCount: 10,
      });
      client.cwd = cwd;
      client.setArgv(
        'promote',
        previousDeployment.id,
        '--yes',
        '--timeout',
        '1'
      );
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Promote in progress');
      await expect(client.stderr).toOutput(
        `The promotion exceeded its deadline - rerun ${chalk.bold(
          `vercel promote ${previousDeployment.id}`
        )} to try again`,
        10000
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });

    it('should immediately exit after requesting promote', async () => {
      const { cwd, previousDeployment } = initPromoteTest();
      client.cwd = cwd;
      client.setArgv(
        'promote',
        previousDeployment.id,
        '--yes',
        '--timeout',
        '0'
      );
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput(
        `Successfully requested promote of ${chalk.bold(projectName)} to ${
          previousDeployment.url
        } (${previousDeployment.id})`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(0);
    });

    it('should error if deployment belongs to different team', async () => {
      const { cwd, previousDeployment } = initPromoteTest();
      client.cwd = cwd;
      previousDeployment.team = {
        id: 'abc',
        name: 'abc',
        slug: 'abc',
      };
      client.setArgv('promote', previousDeployment.id, '--yes');
      const exitCodePromise = promote(client);

      await expect(client.stderr).toOutput(
        `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput(
        'Error: Deployment belongs to a different team'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "promote"').toEqual(1);
    });
  });
});

type DeploymentAlias = {
  alias: {
    alias: string;
    deploymentId: string;
  };
  status: string;
};

function initPromoteTest({
  promoteAliases = [],
  promoteJobStatus = 'succeeded',
  promotePollCount = 2,
  promoteStatusCode,
  deploymentTarget,
}: {
  promoteAliases?: DeploymentAlias[];
  promoteJobStatus?: LastAliasRequest['jobStatus'];
  promotePollCount?: number;
  promoteStatusCode?: number;
  deploymentTarget?: Deployment['target'];
} = {}) {
  const cwd = setupUnitFixture('commands/promote/simple-next-site');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: projectName,
    name: projectName,
  });

  const currentDeployment = useDeployment({ creator: user, project });
  const previousDeployment = useDeployment({
    creator: user,
    project,
    target: deploymentTarget,
  });

  let pollCounter = 0;
  let lastAliasRequest: LastAliasRequest | null = null;

  client.scenario.post(
    '/:version/projects/:project/promote/:id',
    (req, res) => {
      if (promoteStatusCode === 500) {
        res.statusCode = 500;
        res.end('Server error');
        return;
      }

      const { id } = req.params;
      if (previousDeployment.id !== id) {
        res.statusCode = 404;
        res.json({
          error: { code: 'not_found', message: 'Deployment not found', id },
        });
        return;
      }

      lastAliasRequest = {
        fromDeploymentId: currentDeployment.id,
        jobStatus: 'in-progress',
        requestedAt: Date.now(),
        toDeploymentId: id,
        type: 'promote',
      };

      Object.defineProperty(project, 'lastAliasRequest', {
        get(): LastAliasRequest | null {
          if (
            lastAliasRequest &&
            promotePollCount !== undefined &&
            pollCounter++ > promotePollCount
          ) {
            lastAliasRequest.jobStatus = promoteJobStatus;
          }
          return lastAliasRequest;
        },
        set(value: LastAliasRequest | null) {
          lastAliasRequest = value;
        },
      });

      res.statusCode = 201;
      res.end();
    }
  );

  client.scenario.get(
    '/:version/projects/:project/promote/aliases',
    (req, res) => {
      res.json({
        aliases: promoteAliases,
        pagination: null,
      });
    }
  );

  return {
    cwd,
    project,
    currentDeployment,
    previousDeployment,
  };
}
