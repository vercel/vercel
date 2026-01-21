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

  describe('validation warnings', () => {
    it('warns for empty value and allows continue', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Value is empty');
      await expect(client.stderr).toOutput('How to proceed?');
      client.stdin.write('\n'); // Select Continue (first option)
      // Since we chose Continue with confirmation-level warning, skip "Are you sure?"
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });

    it('allows re-entering value when warned', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('"quoted"\n');
      await expect(client.stderr).toOutput('includes surrounding quotes');
      await expect(client.stderr).toOutput('How to proceed?');
      // Select Re-enter (second option)
      client.stdin.write('\x1B[B\n'); // Arrow down then enter
      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('clean-value\n');
      await expect(client.stderr).toOutput('Are you sure?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });

    it('offers trim option for whitespace warnings', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write(' spaced \n');
      await expect(client.stderr).toOutput('starts and ends with whitespace');
      await expect(client.stderr).toOutput('How to proceed?');
      // Select Trim (third option)
      client.stdin.write('\x1B[B\x1B[B\n'); // Arrow down twice then enter
      await expect(client.stderr).toOutput('Trimmed whitespace');
      await expect(client.stderr).toOutput('Are you sure?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });

    it('--yes skips empty value confirmation', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR', '--yes');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Value is empty');
      // Should NOT prompt for confirmation with --yes
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });

    it('--yes skips quoted value confirmation', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR', '--yes');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('"quoted-value"\n');
      await expect(client.stderr).toOutput('includes surrounding quotes');
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });

    it('re-validates trimmed value when it becomes empty', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv('env', 'update', 'TEST_VAR');
      const updatePromise = env(client);

      await expect(client.stderr).toOutput("What's the new value of TEST_VAR?");
      client.stdin.write('   \n'); // Whitespace only
      await expect(client.stderr).toOutput('starts and ends with whitespace');
      await expect(client.stderr).toOutput('How to proceed?');
      client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim (third option)
      await expect(client.stderr).toOutput('Trimmed whitespace');
      // After trimming, value becomes empty - should show empty warning
      await expect(client.stderr).toOutput('Value is empty');
      await expect(client.stderr).toOutput('How to proceed?');
      client.stdin.write('\n'); // Leave as is
      await expect(client.stderr).toOutput('Updated Environment Variable');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });
  });
});
