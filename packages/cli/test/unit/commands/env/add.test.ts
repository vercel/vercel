import { describe, expect, it, beforeEach, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import fs from 'node:fs/promises';
import path from 'node:path';
import env from '../../../../src/commands/env';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, envs, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('env add', () => {
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
        id: '781dt89g8r2h789g',
        key: 'REDIS_CONNECTION_STRING',
        value: 'redis://abc123@redis.example.dev:6379',
        target: ['development'],
        gitBranch: undefined,
        configurationId: null,
        updatedAt: 1557241361455,
        createdAt: 1557241361455,
      },
    ]);
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

  it('adds a variable to the project selected by --project', async () => {
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    useProject({
      ...testProject,
      id: 'explicit-env-add',
      name: 'explicit-env-add',
      accountId: 'team_dummy',
    });
    client.setArgv(
      'env',
      'add',
      'EXPLICIT_PROJECT_VAR',
      'development',
      '--value',
      'value',
      '--yes',
      '--project',
      'explicit-env-add'
    );

    await expect(env(client)).resolves.toEqual(0);
    await expect(client.stderr).toOutput('EXPLICIT_PROJECT_VAR');
  });

  it('continues to use the linked project when --project is omitted', async () => {
    client.setArgv(
      'env',
      'add',
      'LINKED_PROJECT_VAR',
      'development',
      '--value',
      'value',
      '--yes'
    );

    await expect(env(client)).resolves.toEqual(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
      /Project\s+\S+\/vercel-env-pull/
    );
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
        await expect(client.stderr).toOutput('Value?');
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
      it('prints compact result without redundant preview rows or repeating the non-sensitive value', async () => {
        const visibleValue = 'https://api.example.com';

        client.setArgv('env', 'add', 'TRANSCRIPT_VAR', 'preview', 'branchName');
        const exitCodePromise = env(client);

        await expect(client.stderr).toOutput('Environment Variable type?');
        const previewOutput = stripAnsi(client.stderr.getFullOutput());
        expect(previewOutput).toContain(
          'Secret (hidden in the dashboard and unavailable to pulls)'
        );
        expect(previewOutput).toContain(
          'Config (can be revealed after saving)'
        );
        expect(previewOutput).not.toMatch(
          /\n\s{0,2}(Project|Variable|Environments|Branch)\s+/
        );

        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        // Regression guard: the input cursor must land after the prompt gap.
        expect(client.stderr.getFullOutput()).toMatch(
          /Value\?\x1b\[[0-9;]*m\x1b\[10G/
        );
        client.stdin.write(`${visibleValue}\n`);

        await expect(client.stderr).toOutput(
          '✓ Added           TRANSCRIPT_VAR'
        );
        await expect(exitCodePromise).resolves.toBe(0);

        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toMatch(
          /\n✓ Added\s+TRANSCRIPT_VAR\n\s{0,2}Project\s+\S+\/vercel-env-pull\n\s{0,2}Environments\s+Preview\n\s{0,2}Branch\s+branchName\n\s{0,2}Type\s+Config\n/
        );
        expect(fullOutput).not.toMatch(/\n\s{0,2}Variable\s+TRANSCRIPT_VAR\n/);
        expect(fullOutput).toContain(visibleValue);
        expect(fullOutput.slice(fullOutput.indexOf('✓ Added'))).not.toContain(
          visibleValue
        );
        expect(fullOutput).not.toMatch(
          /Added Environment Variable|✅|successfully/
        );
        expect(fullOutput).not.toMatch(
          /^[▲✓] (Project|Variable|Environments|Branch|Type)\s/m
        );
      });

      it('creates the variable as sensitive when the user keeps it at the prompt', async () => {
        const secretValue = 'super-secret-output-guard';
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
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\n'); // Select Secret
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write(`${secretValue}\n`);
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const type = spy.mock.calls[0][3];
        expect(type).toBe('sensitive');
        expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
          secretValue
        );

        spy.mockRestore();
      });

      it('stores as encrypted when the user selects Config', async () => {
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
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(spy).toHaveBeenCalled();
        const type = spy.mock.calls[0][3];
        expect(type).toBe('encrypted');

        spy.mockRestore();
      });

      it('allows Config on Development', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv('env', 'add', 'DEV_ONLY', 'development');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Value?');
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
        await expect(client.stderr).toOutput('Value?');
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
          '`--sensitive` and `--no-sensitive` cannot be used together'
        );
        await expect(exitCodePromise).resolves.toBe(1);
      });

      it('rejects conflicting type flags before project resolution', async () => {
        client.cwd = setupTmpDir();
        client.setArgv(
          'env',
          'add',
          'API_KEY',
          'production',
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
    });

    describe('config/secret visibility', () => {
      it.each([
        undefined,
        '0',
        '1',
      ])('preserves the Development Config default when the retired local override is %s', async featureFlag => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id-or-slug'
        );
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );

        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
        } as any);
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        try {
          if (featureFlag === undefined) {
            delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
          } else {
            process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
          }
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
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const [, , , type, , , targets, , visibility] = addSpy.mock
            .calls[0] as unknown as [
            unknown,
            unknown,
            unknown,
            string,
            unknown,
            unknown,
            string[],
            unknown,
            string,
          ];
          expect(type).toBe('encrypted');
          expect(targets).toEqual(['development']);
          expect(visibility).toBe('config');
          expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
            'Environment Variable type?'
          );
        } finally {
          if (originalFlag === undefined) {
            delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
          } else {
            process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
          }
          teamSpy.mockRestore();
          addSpy.mockRestore();
        }
      });

      it('allows --no-sensitive on Production when team policy is on', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id-or-slug'
        );
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );

        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
        } as any);
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'API_FLAG',
            'production',
            '--value',
            'foo',
            '--no-sensitive',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const [, , , type, , , , , visibility] = addSpy.mock
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
          expect(type).toBe('encrypted');
          expect(visibility).toBe('config');
        } finally {
          teamSpy.mockRestore();
          addSpy.mockRestore();
        }
      });

      it('prints one Type row and no Visibility row in the result', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'API_FLAG',
            'production',
            '--value',
            'foo',
            '--no-sensitive',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput('Type            Config');
          await expect(exitCodePromise).resolves.toBe(0);
          const output = stripAnsi(client.stderr.getFullOutput());
          expect(output.match(/^\s*Type\s+Config$/gm)).toHaveLength(1);
          expect(output).not.toMatch(/^\s*Visibility\s+/m);
        } finally {
          addSpy.mockRestore();
        }
      });

      it('allows --sensitive on Development', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'DEV_SECRET',
            'development',
            '--sensitive',
            '--value',
            'foo',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const [, , , type, , , , , visibility] = addSpy.mock
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
        } finally {
          addSpy.mockRestore();
        }
      });

      it.each([
        undefined,
        '0',
        '1',
      ])('keeps explicit Development Secret behavior independent of the retired local override %s', async featureFlag => {
        const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          if (featureFlag === undefined) {
            delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
          } else {
            process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
          }
          client.setArgv(
            'env',
            'add',
            'DEV_SECRET_EXPLICIT',
            'development',
            '--type',
            'secret',
            '--value',
            'foo',
            '--yes'
          );

          await expect(env(client)).resolves.toBe(0);
          const call = addSpy.mock.calls[0] as unknown[];
          expect(call[3]).toBe('sensitive');
          expect(call[8]).toBe('secret');
        } finally {
          if (originalFlag === undefined) {
            delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
          } else {
            process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = originalFlag;
          }
          addSpy.mockRestore();
        }
      });

      it('omits visibility for public-prefixed keys on Production when team policy is on', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id-or-slug'
        );
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );

        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
        } as any);
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'NEXT_PUBLIC_API_URL',
            'production',
            '--value',
            'https://example.com',
            '--no-sensitive',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const call = addSpy.mock.calls[0] as unknown[];
          expect(call[8]).toBeUndefined();
        } finally {
          teamSpy.mockRestore();
          addSpy.mockRestore();
        }
      });

      it('rejects --sensitive on public-prefixed production keys', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_API_KEY',
          'production',
          '--sensitive',
          '--value',
          'my-secret',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('cannot be a Secret');
        await expect(exitCodePromise).resolves.toBe(1);
      });

      it('rejects an explicit Secret for the linked framework public prefix', async () => {
        testProject.framework = 'nuxtjs';
        client.setArgv(
          'env',
          'add',
          'NUXT_ENV_API_KEY',
          'production',
          '--type',
          'secret',
          '--value',
          'my-secret',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(1);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain('`NUXT_ENV_` exposes this value');
        expect(fullOutput).not.toContain('! `NUXT_ENV_`');
      });

      it('requires an explicit decision for the linked framework public prefix', async () => {
        testProject.framework = 'nuxtjs';
        client.setArgv(
          'env',
          'add',
          'NUXT_ENV_API_KEY',
          'production',
          '--value',
          'safe-value',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(1);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain(
          'Choose explicitly: rename to `API_KEY` with `--type secret`'
        );
      });

      it('ignores another framework public prefix when type is omitted', async () => {
        client.setArgv(
          'env',
          'add',
          'NUXT_ENV_API_KEY',
          'production',
          '--value',
          'safe-value',
          '--yes'
        );

        await expect(env(client)).resolves.toBe(0);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).not.toContain('`NUXT_ENV_` exposes');
        expect(fullOutput).not.toContain('Choose explicitly');
      });

      it('rejects an invalid --type before prompting for a value', async () => {
        client.setArgv(
          'env',
          'add',
          'API_KEY',
          'production',
          '--type',
          'invalid'
        );

        await expect(env(client)).resolves.toBe(1);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain(
          'The `--type` flag must be either `config` or `secret`'
        );
        expect(fullOutput).not.toContain('Value?');
      });

      it('does not ask for type twice after Config is selected', async () => {
        client.setArgv('env', 'add', 'API_KEY', 'production');
        const exitCodePromise = env(client);

        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('sk_live_example\n');

        await expect(exitCodePromise).resolves.toBe(0);
        const fullOutput = stripAnsi(client.stderr.getFullOutput());
        expect(fullOutput).toContain('looks like a credential');
        expect(fullOutput).not.toContain('Store this value as?');
      });

      it('rejects secret visibility on public-prefixed production keys', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_API_URL',
          'production',
          '--visibility',
          'secret',
          '--value',
          'https://example.com',
          '--yes'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('cannot be a Secret');
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          '`--visibility` is deprecated. Use `--type` instead.'
        );
        await expect(exitCodePromise).resolves.toBe(1);
      });

      it('uses explicit --visibility when provided', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'API_KEY',
            'production',
            '--visibility',
            'config',
            '--no-sensitive',
            '--value',
            'foo',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          const call = addSpy.mock.calls[0] as unknown[];
          expect(call[8]).toBe('config');
          expect(stripAnsi(client.stderr.getFullOutput())).toContain(
            '`--visibility` is deprecated. Use `--type` instead.'
          );
        } finally {
          addSpy.mockRestore();
        }
      });

      it.each([
        undefined,
        '0',
        '1',
      ])('keeps --type payloads independent of the retired local override %s', async featureFlag => {
        const originalFlag = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          if (featureFlag === undefined) {
            delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
          } else {
            process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = featureFlag;
          }
          client.setArgv(
            'env',
            'add',
            'GENERIC_SETTING',
            'development',
            '--type',
            'secret',
            '--value',
            'foo',
            '--yes'
          );

          await expect(env(client)).resolves.toBe(0);
          const call = addSpy.mock.calls[0] as unknown[];
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
          addSpy.mockRestore();
        }
      });

      it('accepts matching type aliases with one deprecation warning', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'GENERIC_SETTING',
            'production',
            '--type',
            'config',
            '--visibility',
            'config',
            '--value',
            'foo',
            '--yes'
          );

          await expect(env(client)).resolves.toBe(0);
          expect((addSpy.mock.calls[0] as unknown[])[8]).toBe('config');
          const output = stripAnsi(client.stderr.getFullOutput());
          expect(
            output.match(
              /`--visibility` is deprecated\. Use `--type` instead\./g
            )
          ).toHaveLength(1);
        } finally {
          addSpy.mockRestore();
        }
      });

      it('rejects conflicting type aliases before calling the API', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi.spyOn(addEnvRecordModule, 'default');

        try {
          client.setArgv(
            'env',
            'add',
            'GENERIC_SETTING',
            'production',
            '--type',
            'config',
            '--visibility',
            'secret',
            '--value',
            'foo',
            '--yes'
          );

          await expect(env(client)).resolves.toBe(1);
          expect(addSpy).not.toHaveBeenCalled();
          expect(stripAnsi(client.stderr.getFullOutput())).toContain(
            '`--type config` conflicts with `--visibility secret`'
          );
        } finally {
          addSpy.mockRestore();
        }
      });
    });

    describe('mixed Development + other Environments', () => {
      it('allows selecting all environments when the value is not sensitive', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv('env', 'add', 'MIXED_TARGETS');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Environments?');
        const outputWithInstructions = stripAnsi(client.stderr.getFullOutput());
        expect(outputWithInstructions).toContain(
          'Environments? <space> select, <enter> confirm, <a> toggle all, <i> invert'
        );
        expect(outputWithInstructions).not.toContain(
          'Environments?\n  (<space>'
        );
        // Select Production, Preview, and Development.
        client.stdin.write(' '); // toggle Production (first row)
        client.stdin.write('\x1B[B'); // down to Preview
        client.stdin.write(' '); // toggle Preview
        client.stdin.write('\x1B[B'); // down to Development
        client.stdin.write(' '); // toggle Development
        client.stdin.write('\r'); // submit
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
        expect(targets).toEqual(
          expect.arrayContaining(['production', 'preview', 'development'])
        );

        spy.mockRestore();
      });

      it('includes Development when the value is sensitive', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const spy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        client.setArgv('env', 'add', 'SENSITIVE_MIXED');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\n'); // Select Secret
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('testvalue\n');
        await expect(client.stderr).toOutput('Environments?');
        client.stdin.write(' '); // toggle Production
        client.stdin.write('\x1B[B'); // down to Preview
        client.stdin.write(' '); // toggle Preview
        client.stdin.write('\x1B[B'); // down to Development
        client.stdin.write(' '); // toggle Development
        client.stdin.write('\r'); // submit
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
        expect(type).toBe('sensitive');
        expect(targets).toEqual(
          expect.arrayContaining(['production', 'preview', 'development'])
        );

        spy.mockRestore();
      });
    });

    describe('team policy on', () => {
      it('does not limit non-sensitive adds to Development', async () => {
        const teamModule = await import(
          '../../../../src/util/teams/get-team-by-id-or-slug'
        );
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );

        const teamSpy = vi.spyOn(teamModule, 'default').mockResolvedValue({
          sensitiveEnvironmentVariablePolicy: 'on',
        } as any);
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.setArgv(
            'env',
            'add',
            'POLICY_DEV_ONLY',
            'production',
            '--value',
            'testvalue',
            '--no-sensitive',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const [, , , type, , , targets] = addSpy.mock.calls[0] as unknown as [
            unknown,
            unknown,
            unknown,
            string,
            unknown,
            unknown,
            string[],
          ];
          expect(type).toBe('encrypted');
          expect(targets).toEqual(['production']);
        } finally {
          teamSpy.mockRestore();
          addSpy.mockRestore();
        }
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
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
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
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
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
        expect(client.stderr.getFullOutput()).toContain(
          [
            'Next steps:',
            '- List Environment Variables:',
            '  vercel env ls',
            '- Pull Development Environment Variables into .env.local:',
            '  vercel env pull',
          ].join('\n')
        );
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
        await expect(client.stderr).toOutput('Value?');
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
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\n');
        await expect(client.stderr).toOutput('Value is empty');
        await expect(client.stderr).toOutput(
          '✓ Added           EMPTY_VALUE_YES'
        );
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
          '`NEXT_PUBLIC_` exposes this value to anyone visiting your site'
        );
        await expect(client.stderr).toOutput('Value?');
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
          '`NEXT_PUBLIC_` exposes `NEXT_PUBLIC_API_KEY` to anyone visiting your site'
        );
        const warningOutput = stripAnsi(client.stderr.getFullOutput());
        expect(warningOutput).toContain(
          '! `NEXT_PUBLIC_` exposes `NEXT_PUBLIC_API_KEY` to anyone visiting your site'
        );
        expect(warningOutput).not.toContain('WARNING!');
        await expect(client.stderr).toOutput(
          'How should this variable be stored?'
        );
        client.stdin.write('\x1B[B\n'); // Select Config and keep the public name
        await expect(client.stderr).toOutput('Value?');
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
          '`NEXT_PUBLIC_` exposes `NEXT_PUBLIC_SECRET` to anyone visiting your site'
        );
        await expect(client.stderr).toOutput(
          'How should this variable be stored?'
        );
        client.stdin.write('\n'); // Select Secret and rename
        await expect(client.stderr).toOutput('Renamed to SECRET');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('does not warn that a renamed Secret still uses a custom SvelteKit public prefix', async () => {
        testProject.framework = 'sveltekit';
        await fs.writeFile(
          path.join(client.cwd, 'svelte.config.js'),
          "export default { kit: { env: { publicPrefix: 'BROWSER_' } } };"
        );
        client.setArgv(
          'env',
          'add',
          'BROWSER_API_KEY',
          'preview',
          'branchName'
        );

        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          '`BROWSER_` variables are exposed to the browser by this SvelteKit project.'
        );
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('credential-value\n');
        await expect(client.stderr).toOutput(
          'How should this variable be stored?'
        );
        client.stdin.write('\n'); // Keep private by removing the public prefix
        await expect(client.stderr).toOutput('Renamed to API_KEY');
        await expect(exitCodePromise).resolves.toBe(0);

        expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
          'the Secret type does not prevent that'
        );
      });

      it('warns for quoted value and allows continue', async () => {
        client.setArgv('env', 'add', 'QUOTED_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('"my-value"\n');
        await expect(client.stderr).toOutput('includes surrounding quotes');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\n'); // Select "Leave as is"
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('allows re-entering value when warned', async () => {
        client.setArgv('env', 'add', 'REENTER_VALUE', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('"quoted"\n');
        await expect(client.stderr).toOutput('includes surrounding quotes');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\x1B[B\n'); // Select Re-enter
        await expect(client.stderr).toOutput('Value? Re-enter');
        await new Promise(resolve => setTimeout(resolve, 0));
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
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write(' spaced \n');
        await expect(client.stderr).toOutput('starts and ends with whitespace');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim
        await expect(client.stderr).toOutput('Trimmed whitespace');
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('re-validates trimmed value when it becomes empty', async () => {
        client.setArgv('env', 'add', 'TRIMMED_EMPTY', 'preview', 'branchName');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput('Environment Variable type?');
        client.stdin.write('\x1B[B\n'); // Select Config
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('   \n'); // Whitespace only
        await expect(client.stderr).toOutput('starts and ends with whitespace');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\x1B[B\x1B[B\n'); // Select Trim
        await expect(client.stderr).toOutput('Trimmed whitespace');
        // After trimming, value becomes empty - should show empty warning
        await expect(client.stderr).toOutput('Value is empty');
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('\n'); // Leave as is
        await expect(exitCodePromise).resolves.toBe(0);
      });

      it('treats a nested public prefix as explicitly public', async () => {
        client.setArgv(
          'env',
          'add',
          'NEXT_PUBLIC_NEXT_PUBLIC_SECRET',
          'preview',
          'branchName'
        );
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          '`NEXT_PUBLIC_` exposes this value to anyone visiting your site'
        );
        await expect(client.stderr).toOutput('Value?');
        client.stdin.write('testvalue\n');
        await expect(exitCodePromise).resolves.toBe(0);
        const warningOutput = stripAnsi(client.stderr.getFullOutput());
        expect(warningOutput).not.toContain('Variable name?');
        expect(warningOutput).not.toContain('Renamed to');
      });
    });

    describe('[environment]', () => {
      it('should redact custom [environment] values', async () => {
        testProject.customEnvironments = [
          {
            id: 'env_1234abcd5678efgh',
            slug: 'custom-env-name',
            createdAt: 1717176548879,
            updatedAt: 1717176548879,
            type: 'preview',
            description: '',
            branchMatcher: {
              type: 'endsWith',
              pattern: 'custom',
            },
          },
        ];
        const envName = 'environment-variable';
        try {
          client.setArgv('env', 'add', envName, 'custom-env-name');
          const exitCodePromise = env(client);
          await expect(client.stderr).toOutput('Environment Variable type?');
          client.stdin.write('\x1B[B\n'); // Select Config
          await expect(client.stderr).toOutput('Value?');
          client.stdin.write('testvalue\n');
          await expect(exitCodePromise).resolves.toEqual(0);

          const savedEnv = envs.find(currentEnv => currentEnv.key === envName);
          expect(savedEnv?.customEnvironmentIds).toEqual([
            'env_1234abcd5678efgh',
          ]);

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
        } finally {
          const savedEnvIndex = envs.findIndex(
            currentEnv => currentEnv.key === envName
          );
          if (savedEnvIndex !== -1) {
            envs.splice(savedEnvIndex, 1);
          }
        }
      });

      it('errors on an unknown environment name', async () => {
        client.setArgv('env', 'add', 'environment-variable', 'custom-env-name');
        const exitCodePromise = env(client);
        await expect(client.stderr).toOutput(
          'Invalid environment: custom-env-name'
        );
        await expect(exitCodePromise).resolves.toEqual(1);
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
          await expect(client.stderr).toOutput('Environment Variable type?');
          client.stdin.write('\x1B[B\n'); // Select Config
          await expect(client.stderr).toOutput('Value?');
          client.stdin.write('testvalue\n');
          await expect(client.stderr).toOutput(
            '✓ Added           REDIS_CONNECTION_STRING'
          );
          await expect(client.stderr).toOutput('Type            Config');
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "env"').toEqual(0);
          expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
            /\n✓ Added\s+REDIS_CONNECTION_STRING\n\s{0,2}Project\s+\S+\/vercel-env-pull\n\s{0,2}Environments\s+Preview\n\s{0,2}Branch\s+branchName\n\s{0,2}Type\s+Config\n/
          );
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
          await expect(client.stderr).toOutput('Environment Variable type?');
          client.stdin.write('\x1B[B\n'); // Select Config
          await expect(client.stderr).toOutput('Value?');
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

        it('accepts a Git branch with --git-branch', async () => {
          const addEnvRecordModule = await import(
            '../../../../src/util/env/add-env-record'
          );
          const spy = vi
            .spyOn(addEnvRecordModule, 'default')
            .mockResolvedValue(undefined);

          client.setArgv(
            'env',
            'add',
            'GIT_BRANCH_OPTION',
            'preview',
            '--git-branch',
            'branchName',
            '--value',
            'testvalue',
            '--no-sensitive',
            '--yes'
          );

          await expect(env(client)).resolves.toEqual(0);
          expect(spy.mock.calls[0][7]).toBe('branchName');
          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            { key: 'subcommand:add', value: 'add' },
            { key: 'argument:name', value: '[REDACTED]' },
            { key: 'argument:environment', value: 'preview' },
            { key: 'option:git-branch', value: '[REDACTED]' },
            { key: 'option:value', value: '[REDACTED]' },
            { key: 'flag:no-sensitive', value: 'TRUE' },
            { key: 'flag:yes', value: 'TRUE' },
          ]);

          spy.mockRestore();
        });

        it('rejects a branch provided as both a flag and positional argument', async () => {
          client.setArgv(
            'env',
            'add',
            'DUPLICATE_BRANCH',
            'preview',
            'legacy-branch',
            '--git-branch',
            'flag-branch'
          );

          const exitCode = await env(client);

          expect(exitCode).toEqual(1);
          await expect(client.stderr).toOutput('Git branch was provided twice');
        });

        it('uses all Preview branches without prompting when --yes is set', async () => {
          const addEnvRecordModule = await import(
            '../../../../src/util/env/add-env-record'
          );
          const spy = vi
            .spyOn(addEnvRecordModule, 'default')
            .mockResolvedValue(undefined);

          client.setArgv(
            'env',
            'add',
            'ALL_PREVIEW_BRANCHES',
            'preview',
            '--value',
            'testvalue',
            '--no-sensitive',
            '--yes'
          );

          await expect(env(client)).resolves.toEqual(0);
          expect(spy.mock.calls[0][7]).toBeUndefined();
          expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
            'Git branch?'
          );

          spy.mockRestore();
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
        expect(payload.next[1].command).not.toContain('secret');
        expect(payload.next[1].command).toContain('--value "<value>"');

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
        expect(cmd).toContain('--value "<value>"');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('uses --value with preview and no branch as all Preview branches', async () => {
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

        await expect(exitCodePromise).resolves.toBe(0);
        expect(logSpy).not.toHaveBeenCalled();
        expect(client.stderr.getFullOutput()).toContain(
          'Environments    Preview'
        );
        expect(client.stderr.getFullOutput()).not.toContain('my-secret-value');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('uses stdin with preview and no branch as all Preview branches', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.stdin.isTTY = false;
        client.setArgv('env', 'add', 'PREVIEW_VAR', 'preview', '--yes');
        const exitCodePromise = env(client);
        setImmediate(() => client.stdin.emit('data', 'value-via-stdin'));

        await expect(exitCodePromise).resolves.toBe(0);
        expect(logSpy).not.toHaveBeenCalled();
        expect(client.stderr.getFullOutput()).toContain(
          'Environments    Preview'
        );
        expect(client.stderr.getFullOutput()).not.toContain('value-via-stdin');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('preserves --git-branch in the missing-value suggestion', async () => {
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
          '--git-branch',
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
        expect(payload.next[0].command).toContain('--git-branch feat/test');

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

      it.each([
        [
          'Production secrets must be in their own environment group.',
          'production_secret_must_be_separate',
          'separate Production and non-Production variables with different values',
        ],
        [
          'Production secrets must use a different value than Preview secrets.',
          'production_secret_requires_different_value',
          'Use different Secret values for Production and non-Production',
        ],
      ] as const)('classifies Production Secret policy errors: %s', async (serverMessage, expectedReason, expectedRecovery) => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
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
            'add',
            'API_KEY',
            'preview',
            'feature/test',
            '--type',
            'secret',
            '--value',
            'updated-secret',
            '--yes',
            '--non-interactive'
          );
          client.cwd = setupUnitFixture('vercel-env-pull');

          await expect(env(client)).rejects.toThrow('exit');
          const payload = JSON.parse(
            logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
          );
          expect(payload).toMatchObject({
            status: 'error',
            reason: expectedReason,
            message: expect.stringContaining(expectedRecovery),
          });
        } finally {
          addSpy.mockRestore();
          exitSpy.mockRestore();
          logSpy.mockRestore();
        }
      });
    });

    describe('multi-target environments', () => {
      it('adds one entry spanning comma-separated environments', async () => {
        const envName = 'MULTI_TARGET_VAR';
        try {
          client.setArgv(
            'env',
            'add',
            envName,
            'production,preview,development',
            '--value',
            'multi-value',
            '--no-sensitive',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          const savedEnv = envs.find(currentEnv => currentEnv.key === envName);
          expect(savedEnv?.target).toEqual([
            'production',
            'preview',
            'development',
          ]);
          expect(savedEnv?.type).toBe('encrypted');

          const fullOutput = stripAnsi(client.stderr.getFullOutput());
          expect(fullOutput).toContain('Production, Preview, Development');

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            { key: 'subcommand:add', value: 'add' },
            { key: 'argument:name', value: '[REDACTED]' },
            {
              key: 'argument:environment',
              value: 'production,preview,development',
            },
            { key: 'option:value', value: '[REDACTED]' },
            { key: 'flag:no-sensitive', value: 'TRUE' },
            { key: 'flag:yes', value: 'TRUE' },
          ]);
        } finally {
          const savedEnvIndex = envs.findIndex(
            currentEnv => currentEnv.key === envName
          );
          if (savedEnvIndex !== -1) {
            envs.splice(savedEnvIndex, 1);
          }
        }
      });

      it('dedupes repeated targets and trims whitespace', async () => {
        const envName = 'MULTI_DEDUPE_VAR';
        try {
          client.setArgv(
            'env',
            'add',
            envName,
            'production, preview,production',
            '--value',
            'v',
            '--no-sensitive',
            '--yes'
          );
          await expect(env(client)).resolves.toBe(0);

          const savedEnv = envs.find(currentEnv => currentEnv.key === envName);
          expect(savedEnv?.target).toEqual(['production', 'preview']);
        } finally {
          const savedEnvIndex = envs.findIndex(
            currentEnv => currentEnv.key === envName
          );
          if (savedEnvIndex !== -1) {
            envs.splice(savedEnvIndex, 1);
          }
        }
      });

      it('errors with invalid_environment for an unknown target (non-interactive)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'BAD_TARGET_VAR',
          'production,staging',
          '--value',
          'v',
          '--yes'
        );
        await expect(env(client)).rejects.toThrow('exit');

        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'invalid_environment',
          message: expect.stringContaining('staging'),
        });
        expect(payload.message).toContain('production, preview, development');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('errors when a Git branch is combined with multiple environments (non-interactive)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'BRANCH_MULTI_VAR',
          'production,preview',
          'my-branch',
          '--value',
          'v',
          '--yes'
        );
        await expect(env(client)).rejects.toThrow('exit');

        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'branch_requires_preview_only',
        });

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('adds sensitive vars to all environments including Development (non-interactive)', async () => {
        const addEnvRecordModule = await import(
          '../../../../src/util/env/add-env-record'
        );
        const addSpy = vi
          .spyOn(addEnvRecordModule, 'default')
          .mockResolvedValue(undefined);

        try {
          client.nonInteractive = true;
          client.setArgv(
            'env',
            'add',
            'SENSITIVE_DEV_VAR',
            'production,preview,development',
            '--value',
            'v',
            '--yes'
          );
          const exitCodePromise = env(client);
          await expect(exitCodePromise).resolves.toBe(0);

          expect(addSpy).toHaveBeenCalled();
          const [, , , type, , , targets, , visibility] = addSpy.mock
            .calls[0] as unknown as [
            unknown,
            unknown,
            unknown,
            string,
            unknown,
            unknown,
            string[],
            unknown,
            string,
          ];
          expect(type).toBe('sensitive');
          expect(visibility).toBe('secret');
          expect(targets).toEqual(
            expect.arrayContaining(['production', 'preview', 'development'])
          );
        } finally {
          addSpy.mockRestore();
          client.nonInteractive = false;
        }
      });

      it('includes Development in the multi-target suggestion for --sensitive (non-interactive)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'SENSITIVE_MISSING_ENV',
          '--value',
          'v',
          '--sensitive',
          '--yes'
        );
        await expect(env(client)).rejects.toThrow('exit');

        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload.missing).toContain('missing_environment');
        const commands = payload.next.map(
          (n: { command: string }) => n.command
        );
        const multi = commands.find((c: string) =>
          c.includes('production,preview,development')
        );
        expect(multi).toBeDefined();
        expect(multi).toContain('--sensitive');

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });

      it('includes a comma-separated suggestion when environment is missing (non-interactive)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('exit');
        });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        client.nonInteractive = true;
        client.setArgv(
          'env',
          'add',
          'MISSING_ENV_VAR',
          '--value',
          'v',
          '--yes'
        );
        await expect(env(client)).rejects.toThrow('exit');

        const payload = JSON.parse(
          logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
        );
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'missing_requirements',
          missing: expect.arrayContaining(['missing_environment']),
        });
        const commands = payload.next.map(
          (n: { command: string }) => n.command
        );
        expect(
          commands.some(
            (c: string) =>
              c.includes('production,preview,development') &&
              c.includes('--no-sensitive')
          )
        ).toBe(true);

        exitSpy.mockRestore();
        logSpy.mockRestore();
      });
    });
  });
});
