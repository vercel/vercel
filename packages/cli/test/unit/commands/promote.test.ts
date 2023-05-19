import chalk from 'chalk';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { Request, Response } from 'express';
import promote from '../../../src/commands/promote';
import { LastAliasRequest } from '@vercel-internals/types';
import { setupUnitFixture } from '../../helpers/setup-unit-fixture';
import { useDeployment } from '../../mocks/deployment';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import sleep from '../../../src/util/sleep';

let globalPromoteTimer: NodeJS.Timeout | undefined = undefined;

jest.setTimeout(60000);

describe('promote', () => {
  afterEach(() => {
    clearTimeout(globalPromoteTimer);
  });

  it('should error if cwd is invalid', async () => {
    client.setArgv('promote', '--cwd', __filename);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      'Error: Support for single file deployments has been removed.'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if timeout is invalid', async () => {
    const { cwd } = initPromoteTest();
    client.setArgv('promote', '--yes', '--cwd', cwd, '--timeout', 'foo');
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput('Error: Invalid timeout "foo"');
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if invalid deployment name', async () => {
    const { cwd } = initPromoteTest();
    client.setArgv('promote', '????', '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      'Error: The provided argument "????" is not a valid deployment'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment not found', async () => {
    const { cwd } = initPromoteTest();
    client.setArgv('promote', 'foo', '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput('Fetching deployment "foo" in ');
    await expect(client.stderr).toOutput(
      'Error: Error: Can\'t find the deployment "foo" under the context'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should show status when not rolling back', async () => {
    const { cwd } = initPromoteTest();
    client.setArgv('promote', '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      'Checking promotion status of vercel-promote'
    );
    await expect(client.stderr).toOutput('No deployment promotion in progress');

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should promote by deployment id', async () => {
    const { cwd, previousDeployment } = initPromoteTest();
    client.setArgv('promote', previousDeployment.id, '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Promote in progress');
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-promote')} was promoted to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should promote by deployment url', async () => {
    const { cwd, previousDeployment } = initPromoteTest();
    client.setArgv('promote', previousDeployment.url, '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.url}" in ${previousDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Promote in progress');
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-promote')} was promoted to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should get status while promoting', async () => {
    const { cwd, previousDeployment, project } = initPromoteTest({
      promotePollCount: 10,
    });

    // start the promote
    client.setArgv('promote', previousDeployment.id, '--yes', '--cwd', cwd);
    promote(client);

    // need to wait for the promote request to be accepted
    await sleep(500);

    // get the status
    client.setArgv('promote', '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      `Checking promotion status of ${project.name}`
    );
    await expect(client.stderr).toOutput(
      `Success! ${chalk.bold('vercel-promote')} was promoted to ${
        previousDeployment.url
      } (${previousDeployment.id})`
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should error if promote request fails', async () => {
    const { cwd, previousDeployment } = initPromoteTest({
      promotePollCount: 10,
      promoteStatusCode: 500,
    });

    client.setArgv('promote', previousDeployment.id, '--yes', '--cwd', cwd);
    const exitCodePromise = promote(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );

    await expect(client.stderr).toOutput('Response Error (500)');

    await expect(exitCodePromise).toEqual(1);
  });

  //   it('should error if rollback fails (no aliases)', async () => {
  //     const { cwd, previousDeployment } = initPromoteTest({
  //       rollbackJobStatus: 'failed',
  //     });
  //     client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
  //     const exitCodePromise = promote(client);

  //     await expect(client.stderr).toOutput(
  //       `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
  //     );
  //     await expect(client.stderr).toOutput('Rollback in progress');
  //     await expect(client.stderr).toOutput(
  //       `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
  //     );

  //     await expect(exitCodePromise).resolves.toEqual(1);
  //   });

  //   it('should error if rollback fails (with aliases)', async () => {
  //     const { cwd, previousDeployment } = initPromoteTest({
  //       rollbackAliases: [
  //         {
  //           alias: { alias: 'foo', deploymentId: 'foo_123' },
  //           status: 'completed',
  //         },
  //         {
  //           alias: { alias: 'bar', deploymentId: 'bar_123' },
  //           status: 'failed',
  //         },
  //       ],
  //       rollbackJobStatus: 'failed',
  //     });
  //     client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
  //     const exitCodePromise = promote(client);

  //     await expect(client.stderr).toOutput(
  //       `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
  //     );
  //     await expect(client.stderr).toOutput('Rollback in progress');
  //     await expect(client.stderr).toOutput(
  //       `Error: Failed to remap all aliases to the requested deployment ${previousDeployment.url} (${previousDeployment.id})`
  //     );
  //     await expect(client.stderr).toOutput(
  //       `  ${chalk.green('completed')}    foo (foo_123)`
  //     );
  //     await expect(client.stderr).toOutput(
  //       `  ${chalk.red('failed')}       bar (bar_123)`
  //     );

  //     await expect(exitCodePromise).resolves.toEqual(1);
  //   });

  //   it('should error if deployment times out', async () => {
  //     const { cwd, previousDeployment } = initPromoteTest({
  //       rollbackPollCount: 10,
  //     });
  //     client.setArgv(
  //       'rollback',
  //       previousDeployment.id,
  //       '--yes',
  //       '--cwd',
  //       cwd,
  //       '--timeout',
  //       '2s'
  //     );
  //     const exitCodePromise = promote(client);

  //     await expect(client.stderr).toOutput(
  //       `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
  //     );
  //     await expect(client.stderr).toOutput('Rollback in progress');
  //     await expect(client.stderr).toOutput(
  //       `The rollback exceeded its deadline - rerun ${chalk.bold(
  //         `vercel rollback ${previousDeployment.id}`
  //       )} to try again`
  //     );

  //     await expect(exitCodePromise).resolves.toEqual(1);
  //   });

  //   it('should immediately exit after requesting rollback', async () => {
  //     const { cwd, previousDeployment } = initPromoteTest();
  //     client.setArgv(
  //       'rollback',
  //       previousDeployment.id,
  //       '--yes',
  //       '--cwd',
  //       cwd,
  //       '--timeout',
  //       '0'
  //     );
  //     const exitCodePromise = promote(client);

  //     await expect(client.stderr).toOutput(
  //       `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
  //     );
  //     await expect(client.stderr).toOutput(
  //       `Successfully requested rollback of ${chalk.bold('vercel-promote')} to ${
  //         previousDeployment.url
  //       } (${previousDeployment.id})`
  //     );

  //     await expect(exitCodePromise).resolves.toEqual(0);
  //   });

  //   it('should error if deployment belongs to different team', async () => {
  //     const { cwd, previousDeployment } = initPromoteTest();
  //     previousDeployment.team = {
  //       id: 'abc',
  //       name: 'abc',
  //       slug: 'abc',
  //     };
  //     client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
  //     const exitCodePromise = promote(client);

  //     await expect(client.stderr).toOutput(
  //       `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
  //     );
  //     await expect(client.stderr).toOutput(
  //       'Error: Deployment belongs to a different team'
  //     );

  //     await expect(exitCodePromise).resolves.toEqual(1);
  //   });
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
}: {
  promoteAliases?: DeploymentAlias[];
  promoteJobStatus?: LastAliasRequest['jobStatus'];
  promotePollCount?: number;
  promoteStatusCode?: number;
} = {}) {
  const cwd = setupUnitFixture('commands/promote/simple-next-site');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: 'vercel-promote',
    name: 'vercel-promote',
  });

  const currentDeployment = useDeployment({ creator: user, project });
  const previousDeployment = useDeployment({ creator: user, project });

  client.scenario.post(
    '/:version/projects/:project/promote/:id',
    (req: Request, res: Response) => {
      const { id } = req.params;
      if (previousDeployment.id !== id) {
        res.statusCode = 404;
        res.json({
          error: { code: 'not_found', message: 'Deployment not found', id },
        });
        return;
      }

      if (promoteStatusCode === 500) {
        res.statusCode = 500;
        res.end('Server error');
        return;
      }

      project.lastAliasRequest = {
        fromDeploymentId: currentDeployment.id,
        jobStatus: 'in-progress',
        requestedAt: Date.now(),
        toDeploymentId: id,
        type: 'promote',
      };

      globalPromoteTimer = setTimeout(() => {
        if (project.lastAliasRequest) {
          project.lastAliasRequest.jobStatus = 'succeeded';
        }
      }, 500);

      res.statusCode = 201;
      res.end();
    }
  );

  let counter = 0;

  client.scenario.get(`/:version/projects/${project.id}`, (req, res) => {
    const data = { ...project };
    if (req.query?.rollbackInfo === 'true') {
      if (project.lastAliasRequest && counter++ > promotePollCount) {
        project.lastAliasRequest.jobStatus = promoteJobStatus;
      }
      data.lastAliasRequest = project.lastAliasRequest;
    }
    res.json(data);
  });

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
