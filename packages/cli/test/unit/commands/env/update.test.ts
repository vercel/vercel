import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

    it('errors when --sensitive is used on a Development record', async () => {
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
      await expect(client.stderr).toOutput(
        '--sensitive is not allowed with the Development Environment'
      );
      await expect(exitCodePromise).resolves.toBe(1);
    });

    it('errors when the team enforces sensitive and the record targets Development', async () => {
      const teamModule = await import(
        '../../../../src/util/teams/get-team-by-id'
      );
      const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
        sensitiveEnvironmentVariablePolicy: 'on',
      } as any);

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
      await expect(client.stderr).toOutput(
        'Your team has enabled the Sensitive Environment Variables Policy and the Development Environment does not support sensitive values.'
      );
      await expect(exitCodePromise).resolves.toBe(1);

      teamSpy.mockRestore();
    });

    describe('VERCEL_ENV_VAR_CONFIG_SECRET_UI', () => {
      const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;

      beforeEach(() => {
        process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = '1';
      });

      afterEach(() => {
        if (originalFlag === undefined) {
          delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        } else {
          process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
        }
      });

      it('allows updating a Development record when team policy is on', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id'
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

      it('allows --sensitive on a Development record when flag is enabled', async () => {
        const updateEnvRecordModule = await import(
          '../../../../src/util/env/update-env-record'
        );
        const updateSpy = vi
          .spyOn(updateEnvRecordModule, 'default')
          .mockResolvedValue(undefined);
        const cwd = setupUnitFixture('vercel-env-pull');
        client.cwd = cwd;
        try {
          client.setArgv(
            'env',
            'update',
            'TEST_VAR_DEV',
            '--sensitive',
            '--value',
            'new-value',
            '--yes'
          );
          await expect(env(client)).resolves.toBe(0);
          expect(updateSpy.mock.calls[0]?.[3]).toBe('sensitive');
          expect(updateSpy.mock.calls[0]?.[8]).toBe('secret');
        } finally {
          updateSpy.mockRestore();
        }
      });

      it('resolves the Secret type before confirming the update', async () => {
        const cwd = setupUnitFixture('vercel-env-pull');
        client.cwd = cwd;
        client.setArgv(
          'env',
          'update',
          'TEST_VAR',
          'production',
          '--type',
          'secret',
          '--value',
          'new-value'
        );

        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          'The previous value was readable as Config'
        );
        await expect(client.stderr).toOutput('Type            Secret');
        await expect(client.stderr).toOutput(
          'Update this Environment Variable?'
        );
        const output = stripAnsi(client.stderr.getFullOutput());
        expect(output.indexOf('Type            Secret')).toBeLessThan(
          output.indexOf('Update this Environment Variable?')
        );
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
        expect(client.telemetryEventStore.readonlyEvents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: 'option:type',
              value: 'secret',
            }),
          ])
        );
      });

      it('warns when a plain Config value looks like a credential', async () => {
        const updateEnvRecordModule = await import(
          '../../../../src/util/env/update-env-record'
        );
        const updateSpy = vi
          .spyOn(updateEnvRecordModule, 'default')
          .mockResolvedValue(undefined);
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        useProject(
          {
            ...defaultProject,
            id: 'explicit-plain-update',
            name: 'explicit-plain-update',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'plain',
              id: 'plain-env-id',
              key: 'PUBLIC_VALUE',
              value: 'old-value',
              target: ['production'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        try {
          client.setArgv(
            'env',
            'update',
            'PUBLIC_VALUE',
            'production',
            '--type',
            'config',
            '--value',
            `ghp_${'a'.repeat(30)}`,
            '--yes',
            '--project',
            'explicit-plain-update'
          );

          await expect(env(client)).resolves.toBe(0);
          expect(client.stderr.getFullOutput()).toContain(
            'This name or value looks like a credential'
          );
          expect(updateSpy).toHaveBeenCalled();
        } finally {
          updateSpy.mockRestore();
        }
      });

      it('gives add-and-remove recovery for a public Config that cannot become Secret', async () => {
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        useProject(
          {
            ...defaultProject,
            id: 'explicit-public-update',
            name: 'explicit-public-update',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'encrypted',
              visibility: 'config',
              id: 'public-env-id',
              key: 'NEXT_PUBLIC_API_KEY',
              value: 'old-value',
              target: ['production'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        client.setArgv(
          'env',
          'update',
          'NEXT_PUBLIC_API_KEY',
          'production',
          '--type',
          'secret',
          '--value',
          'new-value',
          '--yes',
          '--project',
          'explicit-public-update'
        );

        await expect(env(client)).resolves.toBe(1);
        const output = client.stderr.getFullOutput();
        expect(output).toContain('cannot be a Secret');
        expect(output).toContain(
          'vercel env add API_KEY production --type secret --project explicit-public-update'
        );
        expect(output).toContain(
          'vercel env rm NEXT_PUBLIC_API_KEY production --project explicit-public-update'
        );
      });

      it.each([
        {
          name: 'custom public prefix',
          publicPrefix: 'BROWSER_',
          envName: 'BROWSER_API_KEY',
          expected:
            '`BROWSER_` exposes this value to anyone visiting your site',
          expectedCommand:
            'vercel env add API_KEY production --type secret --project svelte-update-custom',
        },
        {
          name: 'empty public prefix',
          publicPrefix: '',
          envName: 'API_KEY',
          expected: 'every Environment Variable is exposed to the browser',
          expectedCommand: undefined,
        },
      ])('blocks changing a SvelteKit $name Config to Secret', async ({
        publicPrefix,
        envName,
        expected,
        expectedCommand,
      }) => {
        const projectName = publicPrefix
          ? 'svelte-update-custom'
          : 'svelte-update-empty';
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        await writeFile(
          join(client.cwd, 'svelte.config.js'),
          `export default { kit: { env: { publicPrefix: '${publicPrefix}' } } };\n`
        );
        useProject(
          {
            ...defaultProject,
            id: projectName,
            name: projectName,
            accountId: 'team_dummy',
            framework: 'sveltekit',
          },
          [
            {
              type: 'encrypted',
              visibility: 'config',
              id: 'svelte-config-id',
              key: envName,
              value: 'old-value',
              target: ['production'],
              gitBranch: undefined,
              configurationId: null,
              updatedAt: 1557241361455,
              createdAt: 1557241361455,
            },
          ]
        );
        client.setArgv(
          'env',
          'update',
          envName,
          'production',
          '--type',
          'secret',
          '--value',
          'new-value',
          '--yes',
          '--project',
          projectName
        );

        await expect(env(client)).resolves.toBe(1);
        const output = stripAnsi(client.stderr.getFullOutput());
        expect(output).toContain(expected);
        expect(output).toContain('cannot be kept private as a Secret');
        if (expectedCommand) {
          expect(output).toContain(expectedCommand);
        } else {
          expect(output).not.toContain('Add the private Secret');
        }
      });

      it('explains the remove-and-add path when a Secret cannot become Config', async () => {
        client.cwd = setupTmpDir();
        client.config.currentTeam = 'team_dummy';
        useProject(
          {
            ...defaultProject,
            id: 'explicit-secret-update',
            name: 'explicit-secret-update',
            accountId: 'team_dummy',
          },
          [
            {
              type: 'sensitive',
              visibility: 'secret',
              id: 'secret-env-id',
              key: 'API_KEY',
              value: '',
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
          'API_KEY',
          'production',
          '--type',
          'config',
          '--value',
          'new-value',
          '--yes',
          '--project',
          'explicit-secret-update'
        );

        await expect(env(client)).resolves.toBe(1);
        const output = stripAnsi(client.stderr.getFullOutput());
        expect(output).toContain('A Secret cannot be changed to Config');
        expect(output).toContain(
          'API_KEY" will be unavailable to new builds between these commands'
        );
        expect(output).toContain(
          '    vercel env rm API_KEY production --project explicit-secret-update'
        );
        expect(output).toContain(
          '    vercel env add API_KEY production --type config --project explicit-secret-update'
        );
      });
    });
  });
});
