import { describe, expect, it, beforeEach, vi } from 'vitest';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { ProjectEnvVariable } from '@vercel-internals/types';
import stripAnsi from 'strip-ansi';

describe('env update', () => {
  let testProject: NonNullable<Parameters<typeof useProject>[0]>;

  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    testProject = {
      ...defaultProject,
      id: 'vercel-env-pull',
      name: 'vercel-env-pull',
    };
    useProject(testProject, [
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
      {
        type: 'encrypted',
        visibility: 'secret',
        id: 'visibility-secret',
        key: 'VISIBILITY_SECRET',
        value: '',
        target: ['production'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
        customEnvironmentIds: [],
      },
      {
        type: 'sensitive',
        id: 'multi-target-secret',
        key: 'MULTI_TARGET_SECRET',
        value: '',
        target: ['production', 'preview'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
        customEnvironmentIds: [],
      },
      {
        type: 'encrypted',
        id: 'unrelated-framework-prefix',
        key: 'NUXT_ENV_API_KEY',
        value: 'config-value',
        target: ['production'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
        customEnvironmentIds: [],
      },
      {
        type: 'sensitive',
        id: 'framework-public-secret',
        key: 'NUXT_ENV_SECRET_KEY',
        value: '',
        target: ['production'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
        customEnvironmentIds: [],
      },
      {
        type: 'encrypted',
        id: 'public-config',
        key: 'NEXT_PUBLIC_API_URL',
        value: 'https://example.com',
        target: ['production'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
        customEnvironmentIds: [],
      },
    ]);
  });

  it('updates a variable in the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject(
      {
        ...defaultProject,
        id: 'explicit-env-update',
        name: 'explicit-env-update',
        accountId: 'team_dummy',
      },
      [
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
    client.setArgv(
      'env',
      'update',
      'TEST_VAR',
      'production',
      '--value',
      'updated',
      '--yes',
      '--project',
      'explicit-env-update'
    );

    await expect(env(client)).resolves.toEqual(0);
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

    await expect(client.stderr).toOutput('✓ Updated         TEST_VAR');

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
      await expect(client.stderr).toOutput('Update this Environment Variable?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('✓ Updated');
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
      await expect(client.stderr).toOutput('Update this Environment Variable?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('✓ Updated');
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
      await expect(client.stderr).toOutput('Update this Environment Variable?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('✓ Updated');
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
      await expect(client.stderr).toOutput('✓ Updated');
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
      await expect(client.stderr).toOutput('✓ Updated');
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
      await expect(client.stderr).toOutput('Update this Environment Variable?');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('✓ Updated');
      const exitCode = await updatePromise;
      expect(exitCode).toBe(0);
    });
  });

  describe('Development guards', () => {
    const devEnv: ProjectEnvVariable = {
      type: 'encrypted',
      id: 'test-env-id-dev-123',
      key: 'TEST_VAR_DEV',
      value: 'dev-value',
      target: ['development'],
      gitBranch: undefined,
      configurationId: null,
      updatedAt: 1557241361455,
      createdAt: 1557241361455,
      customEnvironmentIds: [],
    };

    beforeEach(() => {
      client.reset();
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
          devEnv,
        ]
      );
    });

    it('allows --sensitive on a Development record', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv(
        'env',
        'update',
        'TEST_VAR_DEV',
        '--sensitive',
        '--value',
        'new-value',
        '--yes'
      );
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toBe(0);

      expect(updateSpy).toHaveBeenCalled();
      const [, , , type, , , , , visibility] = updateSpy.mock
        .calls[0] as unknown as [
        unknown,
        unknown,
        unknown,
        string,
        unknown,
        unknown,
        unknown,
        unknown,
        string,
      ];
      expect(type).toBe('sensitive');
      expect(visibility).toBe('secret');

      updateSpy.mockRestore();
    });

    it('allows updating a Development record when team policy is on', async () => {
      const teamModule = await import(
        '../../../../src/util/teams/get-team-by-id-or-slug'
      );
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
        sensitiveEnvironmentVariablePolicy: 'on',
      } as any);
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      const cwd = setupUnitFixture('vercel-env-pull');
      client.cwd = cwd;
      client.setArgv(
        'env',
        'update',
        'TEST_VAR_DEV',
        '--value',
        'new-value',
        '--yes'
      );
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toBe(0);

      expect(updateSpy).toHaveBeenCalled();
      const [, , , , , , , , visibility] = updateSpy.mock
        .calls[0] as unknown as [
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        string,
      ];
      expect(visibility).toBe('config');

      teamSpy.mockRestore();
      updateSpy.mockRestore();
    });
  });

  describe('Config and Secret type compatibility', () => {
    beforeEach(() => {
      client.cwd = setupUnitFixture('vercel-env-pull');
    });

    it.each([
      undefined,
      '0',
      '1',
    ])('keeps --type payloads independent of the retired local override %s', async featureFlag => {
      const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        if (featureFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
        }
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          '--type',
          'secret',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        const call = updateSpy.mock.calls[0] as unknown[];
        expect(call[3]).toBe('sensitive');
        expect(call[8]).toBe('secret');
        const output = stripAnsi(client.stderr.getFullOutput());
        expect(output).toMatch(/^\s*Type\s+Secret$/m);
        expect(output).not.toMatch(/^\s*Visibility\s+/m);
      } finally {
        if (originalFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
        }
        updateSpy.mockRestore();
      }
    });

    it.each([
      undefined,
      '0',
      '1',
    ])('preserves a legacy Sensitive record when the retired local override is %s', async featureFlag => {
      const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        if (featureFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
        }
        client.setArgv(
          'env',
          'update',
          'MULTI_TARGET_SECRET',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        const call = updateSpy.mock.calls[0] as unknown[];
        expect(call[3]).toBe('sensitive');
        expect(call[8]).toBe('secret');
      } finally {
        if (originalFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
        }
        updateSpy.mockRestore();
      }
    });

    it('omits inferred visibility for a public Production variable under team policy', async () => {
      const teamModule = await import(
        '../../../../src/util/teams/get-team-by-id-or-slug'
      );
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
        sensitiveEnvironmentVariablePolicy: 'on',
      } as any);
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        client.setArgv(
          'env',
          'update',
          'NEXT_PUBLIC_API_URL',
          '--value',
          'https://updated.example.com',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        const call = updateSpy.mock.calls[0] as unknown[];
        expect(call[3]).toBe('encrypted');
        expect(call[8]).toBeUndefined();
      } finally {
        teamSpy.mockRestore();
        updateSpy.mockRestore();
      }
    });

    it('blocks --yes from saving a credential-looking value to a public Config', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi.spyOn(updateEnvRecordModule, 'default');

      try {
        client.setArgv(
          'env',
          'update',
          'NEXT_PUBLIC_API_URL',
          '--value',
          `sk_live_${'a'.repeat(24)}`,
          '--yes'
        );

        await expect(env(client)).resolves.toBe(1);
        expect(updateSpy).not.toHaveBeenCalled();
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain(
          'add `API_URL` as Secret, then remove `NEXT_PUBLIC_API_URL`'
        );
        expect(fullOutput).toContain('rerun with `--type config`');
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('returns structured recovery instead of inferring public exposure non-interactively', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi.spyOn(updateEnvRecordModule, 'default');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'update',
          'NEXT_PUBLIC_API_URL',
          '--value',
          `sk_live_${'a'.repeat(24)}`,
          '--yes',
          '--non-interactive'
        );

        await expect(env(client)).rejects.toThrow('exit');
        expect(updateSpy).not.toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'unsafe_public_config',
          message: expect.stringContaining(
            'add `API_URL` as Secret, then remove `NEXT_PUBLIC_API_URL`'
          ),
        });
      } finally {
        updateSpy.mockRestore();
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('classifies server-side Production Secret isolation errors', async () => {
      const serverMessage =
        'Production secrets must be in their own environment group.';
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockRejectedValue(
          Object.assign(new Error(serverMessage), {
            status: 400,
            serverMessage,
          })
        );
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          '--type',
          'secret',
          '--value',
          'updated-secret',
          '--yes',
          '--non-interactive'
        );

        await expect(env(client)).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'production_secret_must_be_separate',
          message: expect.stringContaining(
            'separate Production and non-Production variables with different values'
          ),
        });
      } finally {
        updateSpy.mockRestore();
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('accepts matching type aliases with one deprecation warning', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          '--type',
          'config',
          '--visibility',
          'config',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        expect((updateSpy.mock.calls[0] as unknown[])[8]).toBe('config');
        const output = stripAnsi(client.stderr.getFullOutput());
        expect(
          output.match(/`--visibility` is deprecated\. Use `--type` instead\./g)
        ).toHaveLength(1);
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('rejects conflicting type aliases before calling the API', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi.spyOn(updateEnvRecordModule, 'default');

      try {
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          '--type',
          'config',
          '--visibility',
          'secret',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(1);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          '`--type config` conflicts with `--visibility secret`'
        );
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('rejects an invalid --type before prompting for a value', async () => {
      client.setArgv(
        'env',
        'update',
        'TEST_VAR',
        'production',
        '--type',
        'invalid'
      );

      await expect(env(client)).resolves.toBe(1);
      const fullOutput = stripAnsi(client.stderr.getFullOutput());
      expect(fullOutput).toContain(
        'The `--type` flag must be either `config` or `secret`'
      );
      expect(fullOutput).not.toContain("What's the new value");
    });

    it('rejects conflicting type flags before project resolution', async () => {
      client.cwd = setupTmpDir();
      client.setArgv(
        'env',
        'update',
        'API_KEY',
        '--type',
        'config',
        '--sensitive',
        '--value',
        'secret'
      );

      await expect(env(client)).resolves.toBe(1);
      const fullOutput = stripAnsi(client.stderr.getFullOutput());
      expect(fullOutput).toContain(
        '`--type config` cannot be used with `--sensitive`'
      );
      expect(fullOutput).not.toContain("isn't linked");
    });

    it('does not apply another framework public prefix to this project', async () => {
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        client.setArgv(
          'env',
          'update',
          'NUXT_ENV_API_KEY',
          '--type',
          'secret',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        expect((updateSpy.mock.calls[0] as unknown[])[3]).toBe('sensitive');
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('preserves a visibility-only Secret without resending an API-invalid pair', async () => {
      useProject({ ...defaultProject, id: 'visibility-secret-project' }, [
        {
          type: 'encrypted',
          visibility: 'secret',
          id: 'visibility-secret',
          key: 'VISIBILITY_SECRET',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]);
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        client.setArgv(
          'env',
          'update',
          'VISIBILITY_SECRET',
          '--value',
          'updated',
          '--yes'
        );
        await expect(env(client)).resolves.toBe(0);
        const call = updateSpy.mock.calls[0] as unknown[];
        expect(call[3]).toBe('encrypted');
        expect(call[4]).toBeUndefined();
        expect(call[8]).toBeUndefined();
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toMatch(/^\s*Type\s+Secret$/m);
        expect(fullOutput).not.toContain('Config values can be revealed');
        expect(fullOutput).not.toContain(
          'Re-run with `--type secret` to protect it'
        );
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('warns when an existing Secret uses the linked framework public prefix', async () => {
      testProject.framework = 'nuxtjs';
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi
        .spyOn(updateEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      try {
        client.setArgv(
          'env',
          'update',
          'NUXT_ENV_SECRET_KEY',
          '--value',
          'updated',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain(
          '`NUXT_ENV_` exposes this variable to the browser; the Secret type does not prevent that.'
        );
        expect(updateSpy).toHaveBeenCalled();
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('blocks converting a visibility-only Secret to Config', async () => {
      useProject({ ...defaultProject, id: 'visibility-secret-project' }, [
        {
          type: 'encrypted',
          visibility: 'secret',
          id: 'visibility-secret',
          key: 'VISIBILITY_SECRET',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]);
      const updateEnvRecordModule = await import(
        '../../../../src/util/env/update-env-record'
      );
      const updateSpy = vi.spyOn(updateEnvRecordModule, 'default');

      try {
        client.setArgv(
          'env',
          'update',
          'VISIBILITY_SECRET',
          '--type',
          'config',
          '--value',
          'updated',
          '--yes'
        );
        await expect(env(client)).resolves.toBe(1);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          'A Secret cannot be changed to Config'
        );
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('masks interactive Secret input', async () => {
      useProject({ ...defaultProject, id: 'visibility-secret-project' }, [
        {
          type: 'encrypted',
          visibility: 'secret',
          id: 'visibility-secret',
          key: 'VISIBILITY_SECRET',
          value: '',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]);
      const textSpy = vi
        .spyOn(client.input, 'text')
        .mockResolvedValue('updated');

      try {
        client.setArgv('env', 'update', 'VISIBILITY_SECRET', '--yes');
        await expect(env(client)).resolves.toBe(0);
        expect(textSpy).toHaveBeenCalledWith(
          expect.objectContaining({ transformer: expect.any(Function) })
        );
      } finally {
        textSpy.mockRestore();
      }
    });

    it.each([
      ['--value', 'super-secret'],
      ['--value=super-secret'],
    ])('redacts %s from not-linked recovery commands', async (...valueArgs) => {
      const linkModule = await import('../../../../src/util/projects/link');
      vi.spyOn(linkModule, 'getLinkedProject').mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          ...valueArgs,
          '--non-interactive'
        );
        await expect(env(client)).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.next[0].command).not.toContain('--value');
        expect(payload.next[0].command).not.toContain('super-secret');
        expect(payload.next[1].command).toContain('"<value>"');
        expect(payload.next[1].command).not.toContain('super-secret');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
        vi.restoreAllMocks();
      }
    });

    it('redacts the value from confirmation recovery commands', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          '--type',
          'secret',
          '--value',
          'super-secret',
          '--non-interactive'
        );
        await expect(env(client)).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.next[0].command).toContain('"<value>"');
        expect(payload.next[0].command).not.toContain('super-secret');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('preserves every target in Secret-to-Config recovery commands', async () => {
      useProject({ ...defaultProject, id: 'multi-target-project' }, [
        {
          type: 'sensitive',
          id: 'multi-target-secret',
          key: 'MULTI_TARGET_SECRET',
          value: '',
          target: ['production', 'preview'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
          customEnvironmentIds: [],
        },
      ]);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        client.nonInteractive = true;
        client.setArgv(
          'env',
          'update',
          'MULTI_TARGET_SECRET',
          '--type',
          'config',
          '--value',
          'updated',
          '--yes',
          '--non-interactive'
        );
        await expect(env(client)).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.reason).toBe('secret_cannot_become_config');
        expect(payload.next[1].command).toContain('production,preview');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });
});
