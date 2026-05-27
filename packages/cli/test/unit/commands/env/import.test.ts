import { describe, expect, it, beforeEach, vi } from 'vitest';
import { join } from 'path';
import { writeFileSync } from 'fs';
import env from '../../../../src/commands/env';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env import', () => {
  let cwd: string;

  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject(
      {
        ...defaultProject,
        id: 'vercel-env-import',
        name: 'vercel-env-import',
      },
      [
        ...envs,
        {
          type: 'encrypted',
          id: 'existing-var-1',
          key: 'EXISTING_VAR',
          value: 'existing-value',
          target: ['production'],
          gitBranch: undefined,
          configurationId: null,
          updatedAt: 1557241361455,
          createdAt: 1557241361455,
        },
      ]
    );
    cwd = setupUnitFixture('vercel-env-import');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('env', 'import', '--help');
      const exitCodePromise = env(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'env:import',
        },
      ]);
    });
  });

  describe('imports from file', () => {
    it('imports all variables from a .env file', async () => {
      client.setArgv('env', 'import', '.env', 'production', '--force', '--yes');
      const exitCode = await env(client);
      await expect(client.stderr).toOutput('Imported Environment Variables');
      expect(exitCode).toEqual(0);
    });

    it('tracks telemetry events', async () => {
      client.setArgv('env', 'import', '.env', 'production', '--force', '--yes');
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:import',
          value: 'import',
        },
        {
          key: 'argument:file',
          value: '[REDACTED]',
        },
        {
          key: 'argument:environment',
          value: 'production',
        },
        {
          key: 'flag:force',
          value: 'TRUE',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('errors when file does not exist', async () => {
      client.setArgv('env', 'import', 'nonexistent.env', 'production', '--yes');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'The file "nonexistent.env" does not exist'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('errors when file has no variables', async () => {
      client.setArgv('env', 'import', '.env.empty', 'production', '--yes');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'No Environment Variables found in ".env.empty"'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('errors when file argument is missing', async () => {
      client.setArgv('env', 'import');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput('Missing file argument');
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('errors when too many arguments are passed', async () => {
      client.setArgv('env', 'import', '.env', 'production', 'extra-arg');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput('Invalid number of arguments');
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('skips existing variables without --force', async () => {
      // Write a .env file that contains an existing key
      const envFilePath = join(cwd, '.env.with-existing');
      writeFileSync(
        envFilePath,
        'EXISTING_VAR=new-value\nNEW_VAR=fresh-value\n'
      );

      client.setArgv(
        'env',
        'import',
        '.env.with-existing',
        'production',
        '--yes'
      );
      const exitCode = await env(client);
      await expect(client.stderr).toOutput('1 skipped');
      await expect(client.stderr).toOutput('To overwrite existing variables');
      expect(exitCode).toEqual(0);
    });

    it('overwrites existing variables with --force', async () => {
      const addEnvRecordModule = await import(
        '../../../../src/util/env/add-env-record'
      );
      const spy = vi
        .spyOn(addEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      const envFilePath = join(cwd, '.env.force');
      writeFileSync(envFilePath, 'EXISTING_VAR=overwritten\n');

      client.setArgv(
        'env',
        'import',
        '.env.force',
        'production',
        '--force',
        '--yes'
      );
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(spy).toHaveBeenCalled();
      // Verify upsert flag was set (second argument is upsert string)
      const upsertArg = spy.mock.calls[0][2];
      expect(upsertArg).toBe('true');

      spy.mockRestore();
    });

    it('prompts for environment when not provided', async () => {
      client.setArgv('env', 'import', '.env', '--yes');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Import Environment Variables to which Environment?'
      );
      client.stdin.write('\n'); // Select first option (Production)
      await expect(client.stderr).toOutput('Imported Environment Variables');
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('prompts for confirmation without --yes', async () => {
      client.setArgv('env', 'import', '.env', 'production', '--force');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Import 5 Environment Variables to production'
      );
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('Imported Environment Variables');
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('cancels when confirmation is declined', async () => {
      client.setArgv('env', 'import', '.env', 'production', '--force');
      const exitCodePromise = env(client);
      await expect(client.stderr).toOutput(
        'Import 5 Environment Variables to production'
      );
      client.stdin.write('n\n');
      await expect(client.stderr).toOutput('Canceled');
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('handles API errors for individual variables gracefully', async () => {
      const addEnvRecordModule = await import(
        '../../../../src/util/env/add-env-record'
      );
      let callCount = 0;
      const spy = vi
        .spyOn(addEnvRecordModule, 'default')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 2) {
            throw Object.assign(new Error('Rate limited (429)'), {
              status: 429,
              serverMessage: 'Rate limited',
            });
          }
        });

      client.setArgv('env', 'import', '.env', 'production', '--force', '--yes');
      const exitCode = await env(client);

      await expect(client.stderr).toOutput('1 failed');
      expect(exitCode).toEqual(1);
      // Should have attempted all 5 variables despite one failure
      expect(spy).toHaveBeenCalledTimes(5);

      spy.mockRestore();
    });

    it('resolves type as encrypted for development', async () => {
      const addEnvRecordModule = await import(
        '../../../../src/util/env/add-env-record'
      );
      const spy = vi
        .spyOn(addEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      const envFilePath = join(cwd, '.env.dev');
      writeFileSync(envFilePath, 'DEV_VAR=dev-value\n');

      client.setArgv(
        'env',
        'import',
        '.env.dev',
        'development',
        '--force',
        '--yes'
      );
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(spy).toHaveBeenCalled();
      // Type argument (4th arg, index 3) should be 'encrypted' for development
      const typeArg = spy.mock.calls[0][3];
      expect(typeArg).toBe('encrypted');

      spy.mockRestore();
    });

    it('resolves type as sensitive for production', async () => {
      const addEnvRecordModule = await import(
        '../../../../src/util/env/add-env-record'
      );
      const spy = vi
        .spyOn(addEnvRecordModule, 'default')
        .mockResolvedValue(undefined);

      const envFilePath = join(cwd, '.env.prod');
      writeFileSync(envFilePath, 'PROD_VAR=prod-value\n');

      client.setArgv(
        'env',
        'import',
        '.env.prod',
        'production',
        '--force',
        '--yes'
      );
      const exitCode = await env(client);
      expect(exitCode).toEqual(0);

      expect(spy).toHaveBeenCalled();
      // Type argument (4th arg, index 3) should be 'sensitive' for production
      const typeArg = spy.mock.calls[0][3];
      expect(typeArg).toBe('sensitive');

      spy.mockRestore();
    });
  });
});
