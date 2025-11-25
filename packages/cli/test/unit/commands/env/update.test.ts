import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env update', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-pull',
        name: 'vercel-env-pull',
      },
      [
        ...envs,
        {
          type: 'encrypted',
          id: 'test-env-id-123',
          key: 'TEST_VAR',
          value: 'test-value',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]
    );
  });

  it('should show error when environment variable does not exist', async () => {
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'update', 'NON_EXISTENT_VAR');
    const exitCodePromise = env(client);

    await expect(client.stderr).toOutput(
      'The variable "NON_EXISTENT_VAR" was not found. Run `vercel env ls` to see all available Environment Variables.'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env update"').toEqual(1);
  });

  it('should show error with invalid number of arguments', async () => {
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'update', 'VAR1', 'production', 'branch', 'extra');
    const exitCodePromise = env(client);

    await expect(client.stderr).toOutput('Invalid number of arguments');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "env update"').toEqual(1);
  });

  it('should prompt for variable name when not provided', async () => {
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'update');
    const updatePromise = env(client);

    await expect(client.stderr).toOutput(
      "What's the name of the variable to update?"
    );

    client.stdin.write('NON_EXISTENT_VAR\n');

    // Since NON_EXISTENT_VAR doesn't exist, it should show error
    await expect(client.stderr).toOutput(
      'The variable "NON_EXISTENT_VAR" was not found. Run `vercel env ls` to see all available Environment Variables.'
    );

    const exitCode = await updatePromise;
    expect(exitCode).toBe(1);
  });

  it('should successfully update an existing environment variable', async () => {
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
    client.setArgv('env', 'update', 'TEST_VAR', '--yes');
    const updatePromise = env(client);

    await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");

    client.stdin.write('updated-value\n');

    await expect(client.stderr).toOutput(
      'Updated Environment Variable TEST_VAR in Project vercel-env-pull'
    );

    const exitCode = await updatePromise;
    expect(exitCode).toBe(0);
  });
});
