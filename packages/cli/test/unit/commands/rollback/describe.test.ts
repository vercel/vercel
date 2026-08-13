import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import type { Request, Response } from 'express';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import rollback from '../../../../src/commands/rollback';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useDeployment } from '../../../mocks/deployment';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('rollback describe', () => {
  it('should update the rollback description by deployment id', async () => {
    const { cwd, previousDeployment, getLastBody } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      'describe',
      previousDeployment.id,
      '--description',
      'Reverting checkout regression'
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      `Updated rollback description for ${chalk.bold(previousDeployment.url)} (${
        previousDeployment.id
      })`
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(0);
    expect(getLastBody()).toEqual({
      description: 'Reverting checkout regression',
    });
  });

  it('should error if --description is missing', async () => {
    const { cwd, previousDeployment } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv('rollback', 'describe', previousDeployment.id);
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: The --description option is required.'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(1);
  });

  it('should error if --description is empty', async () => {
    const { cwd, previousDeployment } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      'describe',
      previousDeployment.id,
      '--description',
      '   '
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      "Error: The rollback description can't be empty."
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(1);
  });

  it('should error if --description exceeds the maximum length', async () => {
    const { cwd, previousDeployment } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      'describe',
      previousDeployment.id,
      '--description',
      'a'.repeat(251)
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: The rollback description must be 250 characters or fewer.'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(1);
  });

  it('should error if an unknown option is used', async () => {
    const { cwd, previousDeployment } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv(
      'rollback',
      'describe',
      previousDeployment.id,
      '--description',
      'text',
      '--bogus'
    );
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: unknown or unexpected option: --bogus'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(1);
  });

  it('should error if deployment not found', async () => {
    const { cwd } = initDescribeTest();
    client.cwd = cwd;
    client.setArgv('rollback', 'describe', 'foo', '--description', 'text');
    const exitCodePromise = rollback(client);

    await expect(client.stderr).toOutput(
      'Error: Can\'t find the deployment "foo" under the context'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "rollback describe"').toEqual(1);
  });

  describe('telemetry', () => {
    it('tracks usage', async () => {
      const { cwd, previousDeployment } = initDescribeTest();
      client.cwd = cwd;
      client.setArgv(
        'rollback',
        'describe',
        previousDeployment.id,
        '--description',
        'Reverting checkout regression'
      );
      const exitCode = await rollback(client);
      expect(exitCode, 'exit code for "rollback describe"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:describe',
          value: 'describe',
        },
        {
          key: 'argument:urlOrDeploymentId',
          value: '[REDACTED]',
        },
        {
          key: 'option:description',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});

function initDescribeTest() {
  const cwd = setupUnitFixture('commands/rollback/simple-next-site');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: 'vercel-rollback',
    name: 'vercel-rollback',
  });

  const previousDeployment = useDeployment({ creator: user, project });

  let lastBody: unknown;
  client.scenario.patch(
    '/:version/projects/:project/rollback/:id/update-description',
    (req: Request, res: Response) => {
      const { id } = req.params;
      if (previousDeployment.id !== id) {
        res.statusCode = 404;
        res.json({
          error: { code: 'not_found', message: 'Deployment not found', id },
        });
        return;
      }
      lastBody = req.body;
      res.statusCode = 200;
      res.end();
    }
  );

  return {
    cwd,
    project,
    previousDeployment,
    getLastBody: () => lastBody,
  };
}
