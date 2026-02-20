import { describe, expect, it, beforeEach, vi } from 'vitest';
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

  describe('non-interactive', () => {
    it('outputs action_required with missing_requirements when name and value not provided', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'update',
        '--non-interactive',
        '--cwd=../../../test-custom-deployment-id'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_requirements',
        missing: expect.arrayContaining(['missing_name', 'missing_value']),
        message: expect.stringMatching(/name|--value|Example/),
        next: expect.any(Array),
      });
      expect(payload.next[0].command).toMatch(/env update/);
      expect(payload.next[0].command).toContain('--value');
      expect(payload.next[0].command).toContain('--yes');
      expect(payload.next[0].command).toContain('--non-interactive');

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('outputs action_required with missing_value only when name and target provided (production, no branch)', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'update',
        'name',
        'production',
        '--non-interactive',
        '--cwd=../../../test-custom-deployment-id'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_requirements',
        missing: ['missing_value'],
        message: expect.stringMatching(/--value|stdin/),
        next: expect.any(Array),
      });
      // Production does not need branch in suggested command
      expect(payload.next[0].command).toMatch(
        /env update name production --value/
      );
      expect(payload.next[0].command).not.toMatch(/<gitbranch>/);

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('outputs error env_not_found when variable does not exist', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'update',
        'NON_EXISTENT_VAR',
        '--value',
        'x',
        '--yes',
        '--non-interactive'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'env_not_found',
        message: expect.stringContaining('NON_EXISTENT_VAR'),
      });

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('outputs error invalid_arguments when too many args', async () => {
      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.nonInteractive = true;
      client.setArgv(
        'env',
        'update',
        'VAR1',
        'production',
        'branch',
        'extra',
        '--non-interactive'
      );
      const exitCodePromise = env(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: expect.stringMatching(/Invalid number|Usage/),
      });

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });
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
