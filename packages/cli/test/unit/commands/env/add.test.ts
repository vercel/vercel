import { describe, expect, it, beforeEach, vi } from 'vitest';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env add', () => {
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
          id: '781dt89g8r2h789g',
          key: 'REDIS_CONNECTION_STRING',
          value: 'redis://abc123@redis.example.dev:6379',
          target: ['development'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    const cwd = setupUnitFixture('vercel-env-pull');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('[name]', () => {
    describe('--sensitive', () => {
      it('tracks flag', async () => {
        client.setArgv(
          'env',
          'add',
          'SENSITIVE_FLAG',
          'preview',
          'branchName',
          '--sensitive'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of SENSITIVE_FLAG?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:sensitive`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('sensitive prompt', () => {
      it('creates the variable as sensitive when the user keeps it at the prompt', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv(
          'env',
          'add',
          'DEFAULT_SENSITIVE',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of DEFAULT_SENSITIVE?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('y\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const type = spy.mock.calls[0][3];
        expect(type).toBe('sensitive');

        spy.mockRestore();
      });

      it('falls back to encrypted when the user declines at the prompt', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv(
          'env',
          'add',
          'DECLINED_SENSITIVE',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of DECLINED_SENSITIVE?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const type = spy.mock.calls[0][3];
        expect(type).toBe('encrypted');

        spy.mockRestore();
      });

      it('does not prompt on Development, stores as encrypted', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv('env', 'add', 'DEV_ONLY', 'development');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of DEV_ONLY?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const [, , , type, , , targets] = spy.mock.calls[0] as unknown as [
          unknown,
          unknown,
          unknown,
          string,
          unknown,
          unknown,
          string[],
        ];
        expect(type).toBe('encrypted');
        expect(targets).toEqual(['development']);

        spy.mockRestore();
      });
    });

    describe('--no-sensitive', () => {
      it('skips the sensitive prompt and stores as encrypted', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv(
          'env',
          'add',
          'NO_SENSITIVE_FLAG',
          'production',
          '--no-sensitive',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of NO_SENSITIVE_FLAG?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const type = spy.mock.calls[0][3];
        expect(type).toBe('encrypted');

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:add', value: 'add' },
          { key: 'argument:name', value: '[REDACTED]' },
          { key: 'argument:environment', value: 'production' },
          { key: 'flag:no-sensitive', value: 'TRUE' },
          { key: 'flag:yes', value: 'TRUE' },
        ]);

        spy.mockRestore();
      });

      it('errors when combined with --sensitive', async () => {
        client.setArgv(
          'env',
          'add',
          'BOTH_FLAGS',
          'production',
          '--sensitive',
          '--no-sensitive',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          '--sensitive and --no-sensitive cannot be used together'
        );
        await expect(exitCodePromise).resolves.toBe(1);
      });
    });

    describe('--sensitive + Development', () => {
      it('errors when --sensitive is passed and the target is Development', async () => {
        client.setArgv(
          'env',
          'add',
          'DEV_SENS',
          'development',
          '--sensitive',
          '--value',
          'foo',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          '--sensitive is not allowed with the Development Environment'
        );
        await expect(exitCodePromise).resolves.toBe(1);
      });
    });

    describe('Development with team policy on', () => {
      it('errors when the target is Development and the team enforces sensitive', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id'
        );
        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
          // biome-ignore lint/suspicious/noExplicitAny: partial team shape
        } as any);

        client.setArgv(
          'env',
          'add',
          'DEV_UNDER_POLICY',
          'development',
          '--value',
          'foo',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          'Your team has enabled the Sensitive Environment Variables Policy and the Development Environment does not support sensitive values.'
        );
        await expect(exitCodePromise).resolves.toBe(1);

        teamSpy.mockRestore();
      });
    });

    describe('--no-sensitive with team policy on', () => {
      it('warns that --no-sensitive is ignored and stores as sensitive', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id'
        );
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );

        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
          // biome-ignore lint/suspicious/noExplicitAny: partial team shape
        } as any);
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv(
          'env',
          'add',
          'POLICY_OVERRIDE',
          'production',
          '--value',
          'foo',
          '--no-sensitive',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          '--no-sensitive is ignored: your team enforces sensitive Environment Variables for Production and Preview.'
        );
        await expect(exitCodePromise).resolves.toBe(0);

        expect(addSpy).toHaveBeenCalled();
        const type = addSpy.mock.calls[0][3];
        expect(type).toBe('sensitive');

        teamSpy.mockRestore();
        addSpy.mockRestore();
      });
    });

    describe('mixed Development + other Environments', () => {
      it('errors when the interactive checkbox picks Development alongside Production/Preview', async () => {
        client.setArgv('env', 'add', 'MIXED_TARGETS');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of MIXED_TARGETS?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput(
          'Add MIXED_TARGETS to which Environments (select multiple)?'
        );
        // Select Production and Development.
        client.stdin.write(' '); // toggle Production (first row)
        client.stdin.write('\x1B[B'); // down to Preview
        client.stdin.write('\x1B[B'); // down to Development
        client.stdin.write(' '); // toggle Development
        client.stdin.write('\r'); // submit
        await expect(client.stderr).toOutput(
          'Development cannot be combined with other Environments'
        );
        await expect(exitCodePromise).resolves.toBe(1);
      });
    });

    describe('--force', () => {
      it('tracks flag', async () => {
        client.setArgv(
          'env',
          'add',
          'FORCE_FLAG',
          'preview',
          'branchName',
          '--force'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:force`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--guidance', () => {
      it('tracks telemetry', async () => {
        client.setArgv(
          'env',
          'add',
          'FORCE_FLAG',
          'preview',
          'branchName',
          '--force',
          '--guidance'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:force`,
            value: 'TRUE',
          },
          {
            key: `flag:guidance`,
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--yes', () => {
      it('tracks telemetry', async () => {
        client.setArgv(
          'env',
          'add',
          'TEST_YES_FLAG',
          'preview',
          'branchName',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of TEST_YES_FLAG?"
        );
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: 'preview',
          },
          {
            key: `argument:git-branch`,
            value: '[REDACTED]',
          },
          {
            key: `flag:yes`,
            value: 'TRUE',
          },
        ]);
      });

      it('skips confirmation for empty value', async () => {
        client.setArgv(
          'env',
          'add',
          'EMPTY_VALUE_YES',
          'preview',
          'branchName',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of EMPTY_VALUE_YES?"
        );
        client.stdin.write('\n');
        await expect(client.stderr).toOutput('Value is empty');
        await expect(client.stderr).toOutput('Added Environment Variable');
        await expect(exitCodePromise).resolves.toBe(0);
      });
    });

    describe('validation warnings', () => {
      it('warns for public prefix (informational)', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_TEST',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        // Key warning shown early, before value entry
        await expect(client.stderr).toOutput(
          'NEXT_PUBLIC_ variables can be seen by anyone visiting your site'
        );
        await expect(client.stderr).toOutput(
          "What's the value of NEXT_PUBLIC_TEST?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('shows options for sensitive public key', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_API_KEY',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        // Key warning shown early with options
        await expect(client.stderr).toOutput(
          'The NEXT_PUBLIC_ prefix will make API_KEY visible to anyone visiting your site'
        );
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\n'); // Select "Leave as is"
        await expect(client.stderr).toOutput(
          "What's the value of NEXT_PUBLIC_API_KEY?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('allows renaming to remove prefix for sensitive key', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_SECRET',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          'The NEXT_PUBLIC_ prefix will make SECRET visible to anyone visiting your site'
        );
        await expect(client.stderr).toOutput('How to proceed?');
        // Select "Rename to SECRET" (second option)
        client.stdin.write('\x1B[B\n');
        await expect(client.stderr).toOutput('Renamed to SECRET');
        await expect(client.stderr).toOutput("What's the value of SECRET?");
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('warns for quoted value and allows continue', async () => {
        client.setArgv('env', 'add', 'QUOTED_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of QUOTED_VALUE?"
        );
        client.stdin.write('"my-value"\n');
        await expect(client.stderr).toOutput('includes surrounding quotes');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\n'); // Select "Leave as is"
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('allows re-entering value when warned', async () => {
        client.setArgv('env', 'add', 'REENTER_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of REENTER_VALUE?"
        );
        client.stdin.write('"quoted"\n');
        await expect(client.stderr).toOutput('includes surrounding quotes');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\n'); // Select Re-enter
        await expect(client.stderr).toOutput(
          "What's the value of REENTER_VALUE?"
        );
        client.stdin.write('clean-value\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('offers trim option for whitespace warnings', async () => {
        client.setArgv(
          'env',
          'add',
          'WHITESPACE_VALUE',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of WHITESPACE_VALUE?"
        );
        client.stdin.write(' spaced \n');
        await expect(client.stderr).toOutput('starts and ends with whitespace');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim
        await expect(client.stderr).toOutput('Trimmed whitespace');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('re-validates trimmed value when it becomes empty', async () => {
        client.setArgv('env', 'add', 'TRIMMED_EMPTY', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of TRIMMED_EMPTY?"
        );
        client.stdin.write('   \n'); // Whitespace only
        await expect(client.stderr).toOutput('starts and ends with whitespace');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim
        await expect(client.stderr).toOutput('Trimmed whitespace');
        // After trimming, value becomes empty - should show empty warning
        await expect(client.stderr).toOutput('Value is empty');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\n'); // Leave as is
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('re-validates renamed key with nested public prefix', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_NEXT_PUBLIC_SECRET',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        // First warning for outer prefix
        await expect(client.stderr).toOutput(
          'The NEXT_PUBLIC_ prefix will make NEXT_PUBLIC_SECRET visible'
        );
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\n'); // Select rename to NEXT_PUBLIC_SECRET
        await expect(client.stderr).toOutput('Renamed to NEXT_PUBLIC_SECRET');
        // Now should warn again for inner prefix
        await expect(client.stderr).toOutput(
          'The NEXT_PUBLIC_ prefix will make SECRET visible'
        );
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\n'); // Rename again to SECRET
        await expect(client.stderr).toOutput('Renamed to SECRET');
        await expect(client.stderr).toOutput("What's the value of SECRET?");
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });
    });

    describe('[environment]', () => {
      it('should redact custom [environment] values', async () => {
        client.setArgv('env', 'add', 'environment-variable', 'custom-env-name');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          "What's the value of environment-variable?"
        );
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Make it sensitive?');
        client.stdin.write('n\n');
        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: `subcommand:add`,
            value: 'add',
          },
          {
            key: `argument:name`,
            value: '[REDACTED]',
          },
          {
            key: `argument:environment`,
            value: '[REDACTED]',
          },
        ]);
      });

      describe('[gitBranch]', () => {
        it('should allow `gitBranch` to be passed', async () => {
          client.setArgv(
            'env',
            'add',
            'REDIS_CONNECTION_STRING',
            'preview',
            'branchName'
          );
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput(
            "What's the value of REDIS_CONNECTION_STRING?"
          );
          client.stdin.write('testvalue\n');
          await expect(client.stderr).toOutput('Make it sensitive?');
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            'Added Environment Variable REDIS_CONNECTION_STRING to Project vercel-env-pull'
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "env"').toEqual(0);
        });

        it('tracks telemetry events', async () => {
          client.setArgv(
            'env',
            'add',
            'TELEMETRY_EVENTS',
            'preview',
            'branchName'
          );
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput(
            "What's the value of TELEMETRY_EVENTS?"
          );
          client.stdin.write('testvalue\n');
          await expect(client.stderr).toOutput('Make it sensitive?');
          client.stdin.write('n\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: `subcommand:add`,
              value: 'add',
            },
            {
              key: `argument:name`,
              value: '[REDACTED]',
            },
            {
              key: `argument:environment`,
              value: 'preview',
            },
            {
              key: `argument:git-branch`,
              value: '[REDACTED]',
            },
          ]);
        });
      });
    });

    describe('non-interactive mode', () => {
      it('strips a trailing newline from single-line stdin values', async () => {
        const cwd = setupUnitFixture('vercel-env-pull');
        client.cwd = cwd;
        client.stdin.isTTY = false;
        const envName = 'STDIN_SINGLE_LINE_TRIMMED';

        try {
          client.setArgv('env', 'add', envName, 'production');
          const exitCodePromise = env(client);
          setImmediate(() => client.stdin.emit('data', 'my-api-key\n'));

          await expect(client.stderr).toOutput(
            'Removed trailing newline from stdin input'
          );
          await expect(exitCodePromise).resolves.toBe(0);

          const savedEnv = envs.find(currentEnv => currentEnv.key === envName);
          expect(savedEnv?.value).toBe('my-api-key');
        } finally {
          const savedEnvIndex = envs.findIndex(
            currentEnv => currentEnv.key === envName
          );
          if (savedEnvIndex !== -1) {
            envs.splice(savedEnvIndex, 1);
          }
        }
      });

      it('outputs action_required when name is missing', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv('env', 'add', '--non-interactive');
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'missing_requirements',
          missing: expect.arrayContaining(['missing_name']),
          message: expect.stringMatching(/required|name|Example/),
          next: expect.any(Array),
        });
        expect(payload.next.length).toBeGreaterThanOrEqual(1);
        expect(payload.next[0].command).not.toMatch(/\u001b|\[\d+m/);
        expect(payload.next[0].command).toMatch(/env add/);
        expect(payload.next[0].command).toContain('--non-interactive');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs JSON with link then add when not linked (non-interactive)', async () => {
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

        client.nonInteractive = true;
        client.stdin.isTTY = false;
        client.setArgv(
          'env',
          'add',
          'NOT_LINKED_VAR',
          'preview',
          '--yes',
          '--cwd=../../../test-custom-deployment-id',
          '--non-interactive'
        );
        const exitCodePromise = env(client);
        setImmediate(() => client.stdin.emit('data', 'value-via-stdin'));

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'not_linked',
          message: expect.stringContaining("isn't linked"),
          next: [
            { command: expect.any(String) },
            { command: expect.any(String) },
          ],
        });
        expect(payload.next[0].command).toMatch(/link/);
        expect(payload.next[0].command).toContain('--scope');
        expect(payload.next[0].command).toContain('<scope>');
        expect(payload.next[0].command).not.toMatch(/--value/);
        expect(payload.next[1].command).toMatch(/env add/);
        expect(payload.next[1].command).toContain('<gitbranch>');
        expect(payload.next[1].command).toContain(
          '--cwd=../../../test-custom-deployment-id'
        );
        expect(payload.next[1].command).toContain('--non-interactive');

        exitSpy.mockRestore();
        logSpy.mockRestore();
        vi.restoreAllMocks();
      });

      it('when not linked, link next command does not include --value (env-add only)', async () => {
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

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'VAR',
          'preview',
          '--value',
          'secret',
          '--yes',
          '--cwd=/tmp',
          '--non-interactive'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.next[0].command).toMatch(/link/);
        expect(payload.next[0].command).not.toMatch(/--value|secret/);
        expect(payload.next[1].command).toMatch(/env add/);
        expect(payload.next[1].command).toContain('--value');
        expect(payload.next[1].command).toContain('secret');

        exitSpy.mockRestore();
        logSpy.mockRestore();
        vi.restoreAllMocks();
      });

      it('outputs action_required when name is missing and preserves --cwd in next command', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          '--cwd=../../../test-custom-deployment-id',
          '--non-interactive'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.next[0].command).toContain(
          '--cwd=../../../test-custom-deployment-id'
        );
        expect(payload.next[0].command).toContain('--non-interactive');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs action_required for sensitive public key without --yes (missing value reported first)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_API_KEY',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        // All missing args reported in one shot; value is missing so we get missing_requirements first
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'missing_requirements',
          missing: expect.arrayContaining(['missing_value']),
          message: expect.stringMatching(/required|--value|Example/),
          next: expect.any(Array),
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs action_required when value would be prompted without stdin or --value', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv('env', 'add', 'SOME_VAR', 'production');
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'missing_requirements',
          missing: expect.arrayContaining(['missing_value']),
          message: expect.stringMatching(/--value|stdin|required|Example/),
          next: expect.any(Array),
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('missing_value next command does not duplicate --yes', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'test1',
          'preview',
          '--yes',
          '--cwd=../../../test-custom-deployment-id',
          '--non-interactive'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.reason).toBe('missing_requirements');
        expect(payload.missing).toContain('missing_value');
        const cmd = payload.next[0].command;
        expect(cmd).not.toMatch(/--yes\s+--yes/);
        expect(cmd).toContain('--yes');
        expect(cmd).toContain('--value <value>');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('uses --value when provided and reaches next prompt (e.g. git_branch_required)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'PREVIEW_VAR',
          'preview',
          '--value',
          'my-secret-value',
          '--yes'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.reason).toBe('git_branch_required');
        expect(
          payload.next.some(
            (n: { command: string }) =>
              n.command.includes('preview') && n.command.includes('<gitbranch>')
          )
        ).toBe(true);

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs action_required when preview target and git branch not passed (no third argument)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.stdin.isTTY = false;
        client.setArgv('env', 'add', 'PREVIEW_VAR', 'preview', '--yes');
        const exitCodePromise = env(client);
        setImmediate(() => client.stdin.emit('data', 'value-via-stdin'));

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'git_branch_required',
          message: expect.stringMatching(/Git branch|third argument|Preview/),
          next: expect.any(Array),
        });
        expect(payload.next.length).toBeGreaterThanOrEqual(1);
        expect(
          payload.next.some(
            (n: { command: string }) =>
              n.command.includes('preview') &&
              (n.command.includes('<gitbranch>') ||
                n.command.includes('--value'))
          )
        ).toBe(true);

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('does not output git_branch_required when branch is passed as third argument for preview', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'PREVIEW_WITH_FLAG',
          'preview',
          'feat/test',
          '--yes'
        );
        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        expect(logSpy).toHaveBeenCalled();
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.reason).toBe('missing_requirements');
        expect(payload.missing).toContain('missing_value');
        expect(payload.missing).not.toContain('git_branch_required');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs API errors (e.g. branch not found) as JSON in non-interactive mode', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        vi.spyOn(addEnvRecordModule, 'default').mockRejectedValue(
          Object.assign(
            new Error(
              'Branch "branch" not found in the connected Git repository (400)'
            ),
            {
              status: 400,
              serverMessage:
                'Branch "branch" not found in the connected Git repository',
            }
          )
        );

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'MY_VAR',
          'preview',
          'branch',
          '--value',
          'secret',
          '--yes',
          '--non-interactive'
        );
        client.cwd = setupUnitFixture('vercel-env-pull');

        const exitCodePromise = env(client);

        await expect(exitCodePromise).rejects.toThrow('exit');
        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'branch_not_found',
          message: expect.stringMatching(/Branch.*not found/),
        });

        vi.restoreAllMocks();
        exitSpy.mockRestore();
        logSpy.mockRestore();
      });
    });
  });
});
