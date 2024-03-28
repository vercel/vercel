import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { Request, Response } from 'express';
import rollback from '../../../src/commands/rollback';
import type { LastAliasRequest } from '@vercel-internals/types';
import { setupUnitFixture } from '../../helpers/setup-unit-fixture';
import { useDeployment } from '../../mocks/deployment';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import sleep from '../../../src/util/sleep';
import { vi } from 'vitest';

vi.setConfig({ testTimeout: 60000 });

describe('rollback', () => {
  it('should error if timeout is invalid', async () => {
    const { cwd } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', '--yes', '--timeout', 'foo');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Error: Invalid timeout "foo"');
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if invalid deployment ID', async () => {
    const { cwd } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', '????', '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: The provided argument "????" is not a valid deployment ID or URL'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment not found', async () => {
    const { cwd } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', 'foo', '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: Can\'t find the deployment "foo" under the context'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should show status when not rolling back', async () => {
    const { cwd } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Checking rollback status of vercel-rollback'
    );
    await expect(client.stderr).toOutput('No deployment rollback in progress');

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should rollback by deployment id', async () => {
    const { cwd, previousDeployment } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', previousDeployment.id, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Rollback in progress');
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-rollback')} was rolled back to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should rollback by deployment url', async () => {
    const { cwd, previousDeployment } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv('rollback', previousDeployment.url, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.url}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Rollback in progress');
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-rollback')} was rolled back to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should get status while rolling back', async () => {
    const { cwd, previousDeployment, project } = initRollbackTest({
      rollbackPollCount: 10,
    });
    client.cwd = cwd;

    // start the rollback
    client.setArgv('rollback', previousDeployment.id, '--yes');
    rollback(client);

    // need to wait for the rollback request to be accepted
    await sleep(300);

    // get the status
    client.setArgv('rollback', '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Checking rollback status of ${project.name}`
    );
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-rollback')} was rolled back to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should error if rollback request fails', async () => {
    const { cwd, previousDeployment } = initRollbackTest({
      rollbackPollCount: 10,
      rollbackStatusCode: 500,
    });
    client.cwd = cwd;

    client.setArgv('rollback', previousDeployment.id, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    // we need to wait a super long time because fetch will return on 500
    await expect(client.stderr).toOutput('Response Error (500)', 20000);

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if rollback fails (no aliases)', async () => {
    const { cwd, previousDeployment } = initRollbackTest({
      rollbackJobStatus: 'failed',
    });
    client.cwd = cwd;
    client.setArgv('rollback', previousDeployment.id, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Rollback in progress');
    await expect(client.stderr).toOutput(
      `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if rollback fails (with aliases)', async () => {
    const { cwd, previousDeployment } = initRollbackTest({
      rollbackAliases: [
        {
          alias: { alias: 'foo', deploymentId: 'foo_123' },
          status: 'completed',
        },
        {
          alias: { alias: 'bar', deploymentId: 'bar_123' },
          status: 'failed',
        },
      ],
      rollbackJobStatus: 'failed',
    });
    client.cwd = cwd;
    client.setArgv('rollback', previousDeployment.id, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Rollback in progress');
    await expect(client.stderr).toOutput(
      `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
    );
    await expect(client.stderr).toOutput(
      `  ${chalk.green('completed')}    foo (foo_123)`
    );
    await expect(client.stderr).toOutput(
      `  ${chalk.red('failed')}       bar (bar_123)`
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment times out', async () => {
    const { cwd, previousDeployment } = initRollbackTest({
      rollbackPollCount: 10,
    });
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      previousDeployment.id,
      '--yes',
      '--timeout',
      '1'
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Rollback in progress');
    await expect(client.stderr).toOutput(
      `The rollback exceeded its deadline - rerun ${chalk.bold(
        `vercel rollback ${previousDeployment.id}`
      )} to try again`
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should immediately exit after requesting rollback', async () => {
    const { cwd, previousDeployment } = initRollbackTest();
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      previousDeployment.id,
      '--yes',
      '--timeout',
      '0'
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      `Successfully requested rollback of ${chalk.bold('vercel-rollback')} to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should error if deployment belongs to different team', async () => {
    const { cwd, previousDeployment } = initRollbackTest();
    previousDeployment.team = {
      id: 'abc',
      name: 'abc',
      slug: 'abc',
    };
    client.cwd = cwd;
    client.setArgv('rollback', previousDeployment.id, '--yes');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      'Error: Deployment belongs to a different team'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });
});

type RollbackAlias = {
  alias: {
    alias: string;
    deploymentId: string;
  };
  status: string;
};

function initRollbackTest({
  rollbackAliases = [],
  rollbackJobStatus = 'succeeded',
  rollbackPollCount = 2,
  rollbackStatusCode,
}: {
  rollbackAliases?: RollbackAlias[];
  rollbackJobStatus?: LastAliasRequest['jobStatus'];
  rollbackPollCount?: number;
  rollbackStatusCode?: number;
} = {}) {
  const cwd = setupUnitFixture('commands/rollback/simple-next-site');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: 'vercel-rollback',
    name: 'vercel-rollback',
  });

  const currentDeployment = useDeployment({ creator: user, project });
  const previousDeployment = useDeployment({ creator: user, project });

  let pollCounter = 0;
  let lastAliasRequest: LastAliasRequest | null = null;

  client.scenario.post(
    '/:version/projects/:project/rollback/:id',
    (req: Request, res: Response) => {
      const { id } = req.params;
      if (previousDeployment.id !== id) {
        res.statusCode = 404;
        res.json({
          error: { code: 'not_found', message: 'Deployment not found', id },
        });
        return;
      }

      if (rollbackStatusCode === 500) {
        res.statusCode = 500;
        res.end('Server error');
        return;
      }

      lastAliasRequest = {
        fromDeploymentId: currentDeployment.id,
        jobStatus: 'in-progress',
        requestedAt: Date.now(),
        toDeploymentId: id,
        type: 'rollback',
      };

      Object.defineProperty(project, 'lastAliasRequest', {
        get(): LastAliasRequest | null {
          if (
            lastAliasRequest &&
            rollbackPollCount !== undefined &&
            pollCounter++ > rollbackPollCount
          ) {
            lastAliasRequest.jobStatus = rollbackJobStatus;
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
    '/:version/projects/:project/rollback/aliases',
    (req, res) => {
      res.json({
        aliases: rollbackAliases,
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
