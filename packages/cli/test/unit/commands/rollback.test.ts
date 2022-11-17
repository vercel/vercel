import chalk from 'chalk';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { Request, Response } from 'express';
import rollback from '../../../src/commands/rollback';
import { RollbackTarget } from '../../../src/types';
import { setupFixture } from '../../helpers/setup-fixture';
import { useDeployment } from '../../mocks/deployment';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import sleep from '../../../src/util/sleep';

jest.setTimeout(60000);

describe('rollback', () => {
  it('should error if cwd is invalid', async () => {
    client.setArgv('rollback', '--cwd', __filename);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: Support for single file deployments has been removed.'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if invalid deployment name', async () => {
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    useDeployment({ creator: user });

    client.setArgv('rollback', '????', '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
    await expect(client.stderr).toOutput(
      'Error: The provided argument "????" is not a valid deployment or project'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment not found', async () => {
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    useDeployment({ creator: user });

    client.setArgv('rollback', 'foo', '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
    await expect(client.stderr).toOutput('Fetching deployment "foo" in ');
    await expect(client.stderr).toOutput(
      'Error: Error: Can\'t find the deployment "foo" under the context'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should show status when not rolling back', async () => {
    const cwd = setupFixture('vercel-rollback');
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });

    client.scenario.get(`/v9/projects/${project.id}`, (req, res) => {
      res.json(project);
    });

    client.setArgv('rollback', '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
    await expect(client.stderr).toOutput(
      'Checking rollback status of vercel-rollback'
    );
    await expect(client.stderr).toOutput('No deployment rollback in progress');

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should rollback by deployment id', async () => {
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    const currentDeployment = useDeployment({ creator: user });
    const previousDeployment = useDeployment({ creator: user });
    let lastRollbackTarget: RollbackTarget | null = null;

    client.scenario.post(
      '/:version/projects/:project/rollback/:id',
      (req: Request, res: Response) => {
        const { id } = req.params;
        if (previousDeployment.id === id) {
          lastRollbackTarget = {
            fromDeploymentId: currentDeployment.id,
            jobStatus: 'in-progress',
            requestedAt: Date.now(),
            toDeploymentId: id,
          };
          res.statusCode = 201;
          res.end();
        } else {
          res.statusCode = 404;
          res.json({
            error: { code: 'not_found', message: 'Deployment not found', id },
          });
        }
      }
    );

    let counter = 0;

    client.scenario.get(`/v9/projects/${project.id}`, (req, res) => {
      const data = { ...project };
      if (req.query?.rollbackInfo === 'true') {
        if (lastRollbackTarget && counter++ > 2) {
          lastRollbackTarget.jobStatus = 'succeeded';
        }
        data.lastRollbackTarget = lastRollbackTarget;
      }
      res.json(data);
    });

    client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
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
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    const currentDeployment = useDeployment({ creator: user });
    const previousDeployment = useDeployment({ creator: user });
    let lastRollbackTarget: RollbackTarget | null = null;

    client.scenario.post(
      '/:version/projects/:project/rollback/:id',
      (req: Request, res: Response) => {
        const { id } = req.params;
        if (previousDeployment.id === id) {
          lastRollbackTarget = {
            fromDeploymentId: currentDeployment.id,
            jobStatus: 'in-progress',
            requestedAt: Date.now(),
            toDeploymentId: id,
          };
          res.statusCode = 201;
          res.end();
        } else {
          res.statusCode = 404;
          res.json({
            error: { code: 'not_found', message: 'Deployment not found', id },
          });
        }
      }
    );

    client.scenario.get(`/:version/now/deployments/get`, (req, res) => {
      const { url } = req.query;
      if (url === previousDeployment.url) {
        res.json({ id: previousDeployment.id });
      } else {
        res.statusCode = 404;
        res.json({
          error: { code: 'not_found', message: 'Deployment not found' },
        });
      }
    });

    let counter = 0;

    client.scenario.get(`/v9/projects/${project.id}`, (req, res) => {
      const data = { ...project };
      if (req.query?.rollbackInfo === 'true') {
        if (lastRollbackTarget && counter++ > 2) {
          lastRollbackTarget.jobStatus = 'succeeded';
        }
        data.lastRollbackTarget = lastRollbackTarget;
      }
      res.json(data);
    });

    client.setArgv('rollback', previousDeployment.url, '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
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
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    const currentDeployment = useDeployment({ creator: user });
    const previousDeployment = useDeployment({ creator: user });
    let lastRollbackTarget: RollbackTarget | null = null;

    client.scenario.post(
      '/:version/projects/:project/rollback/:id',
      (req: Request, res: Response) => {
        const { id } = req.params;
        if (previousDeployment.id === id) {
          lastRollbackTarget = {
            fromDeploymentId: currentDeployment.id,
            jobStatus: 'in-progress',
            requestedAt: Date.now(),
            toDeploymentId: id,
          };
          res.statusCode = 201;
          res.end();
        } else {
          res.statusCode = 404;
          res.json({
            error: { code: 'not_found', message: 'Deployment not found', id },
          });
        }
      }
    );

    let counter = 0;

    client.scenario.get(`/v9/projects/${project.id}`, (req, res) => {
      const data = { ...project };
      if (req.query?.rollbackInfo === 'true') {
        if (lastRollbackTarget && counter++ > 10) {
          lastRollbackTarget.jobStatus = 'succeeded';
        }
        data.lastRollbackTarget = lastRollbackTarget;
      }
      res.json(data);
    });

    // start the rollback
    client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
    rollback(client);

    // need to wait for the rollback request to be accepted
    await sleep(500);

    // get the status
    client.setArgv('rollback', '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
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
    const cwd = setupFixture('vercel-rollback');
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-rollback',
      name: 'vercel-rollback',
    });
    const previousDeployment = useDeployment({ creator: user });

    client.scenario.post(
      '/:version/projects/:project/rollback/:id',
      (req: Request, res: Response) => {
        const { id } = req.params;
        if (previousDeployment.id === id) {
          res.statusCode = 500;
          res.end('Server error');
        } else {
          res.statusCode = 404;
          res.json({
            error: { code: 'not_found', message: 'Deployment not found', id },
          });
        }
      }
    );

    client.setArgv('rollback', previousDeployment.id, '--yes', '--cwd', cwd);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput('Retrieving project…');
    await expect(client.stderr).toOutput(
      `Fetching deployment "${previousDeployment.id}" in ${previousDeployment.creator?.username}`
    );

    await expect(exitCodePromise).rejects.toThrow('Response Error (500)');
  });

  it('should error if rollback fails', async () => {
    //
  });

  it('should error if deployment times out', async () => {
    //
  });
});
