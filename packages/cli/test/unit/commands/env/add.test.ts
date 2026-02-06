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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput("What's the value of FORCE_FLAG?");
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of NEXT_PUBLIC_TEST?"
        );
        client.stdin.write('testvalue\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of NEXT_PUBLIC_API_KEY?"
        );
        client.stdin.write('testvalue\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput("What's the value of SECRET?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('warns for quoted value and allows continue', async () => {
        client.setArgv('env', 'add', 'QUOTED_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of QUOTED_VALUE?"
        );
        client.stdin.write('"my-value"\n');
        await expect(client.stderr).toOutput('includes surrounding quotes');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\n'); // Select "Leave as is"
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('allows re-entering value when warned', async () => {
        client.setArgv('env', 'add', 'REENTER_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of WHITESPACE_VALUE?"
        );
        client.stdin.write(' spaced \n');
        await expect(client.stderr).toOutput('starts and ends with whitespace');
        await expect(client.stderr).toOutput('How to proceed?');
        client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim
        await expect(client.stderr).toOutput('Trimmed whitespace');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('re-validates trimmed value when it becomes empty', async () => {
        client.setArgv('env', 'add', 'TRIMMED_EMPTY', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
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
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput("What's the value of SECRET?");
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });
    });

    describe('[environment]', () => {
      it('should redact custom [environment] values', async () => {
        client.setArgv('env', 'add', 'environment-variable', 'custom-env-name');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Mark as sensitive?');
        client.stdin.write('n\n');
        await expect(client.stderr).toOutput(
          "What's the value of environment-variable?"
        );
        client.stdin.write('testvalue\n');
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
          await expect(client.stderr).toOutput('Mark as sensitive?');
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            "What's the value of REDIS_CONNECTION_STRING?"
          );
          client.stdin.write('testvalue\n');
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
          await expect(client.stderr).toOutput('Mark as sensitive?');
          client.stdin.write('n\n');
          await expect(client.stderr).toOutput(
            "What's the value of TELEMETRY_EVENTS?"
          );
          client.stdin.write('testvalue\n');
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
          reason: 'missing_name',
          message: expect.stringContaining('Provide the variable name'),
          next: expect.any(Array),
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs action_required for sensitive public key without --yes', async () => {
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
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'env_key_sensitive',
          message: expect.stringContaining('NEXT_PUBLIC_API_KEY'),
          choices: expect.any(Array),
          next: expect.any(Array),
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('outputs action_required when value would be prompted without stdin', async () => {
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
          reason: 'missing_value',
          message: expect.stringContaining('stdin'),
          next: expect.any(Array),
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });
    });
  });
});
