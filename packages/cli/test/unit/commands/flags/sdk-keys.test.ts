import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultSdkKeys } from '../../../mocks/flags';
import type { SdkKey } from '../../../../src/util/flags/types';

describe('flags sdk-keys', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    // Disable TTY to prevent interactive prompts
    client.stdin.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'sdk-keys', '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'flag:help',
          value: 'flags sdk-keys',
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('flags', 'sdk-keys');
    const exitCodePromise = flags(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('ls', () => {
    it('tracks `ls` subcommand', async () => {
      client.setArgv('flags', 'sdk-keys', 'ls');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
      ]);
    });

    it('lists SDK keys successfully', async () => {
      client.setArgv('flags', 'sdk-keys', 'ls');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });

    it('renders the partial key value in the default table output', async () => {
      client.setArgv('flags', 'sdk-keys', 'ls');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      const stdout = client.stdout.getFullOutput();
      const combined = `${stderr}\n${stdout}`;

      expect(combined).toContain('Partial Key Value');
      expect(combined).toContain('vf_server_abc********');
      expect(combined).toContain('vf_client_def********');
    });

    it('never leaks cleartext secrets in the default table output', async () => {
      const sdkKeysWithSecrets: SdkKey[] = [
        {
          ...defaultSdkKeys[0],
          keyValue: 'vf_server_fullsecretvalue_should_not_leak',
          tokenValue: 'tok_fullsecrettoken_should_not_leak',
          connectionString:
            'https://flags.vercel.com/v1/flags/secret_should_not_leak',
        },
      ];
      client.reset();
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-flags-test',
        name: 'vercel-flags-test',
      });
      useFlags(undefined, sdkKeysWithSecrets);
      const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
      client.cwd = cwd;
      client.stdin.isTTY = false;

      client.setArgv('flags', 'sdk-keys', 'ls');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      const stdout = client.stdout.getFullOutput();
      const combined = `${stderr}\n${stdout}`;

      expect(combined).not.toContain(
        'vf_server_fullsecretvalue_should_not_leak'
      );
      expect(combined).not.toContain('tok_fullsecrettoken_should_not_leak');
      expect(combined).not.toContain('secret_should_not_leak');
    });

    describe('--json', () => {
      it('outputs valid JSON with SDK key data', async () => {
        client.setArgv('flags', 'sdk-keys', 'ls', '--json');
        const exitCode = await flags(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const parsed = JSON.parse(output);

        expect(parsed).toHaveProperty('sdkKeys');
        expect(parsed.sdkKeys).toHaveLength(2);
        expect(parsed.sdkKeys[0]).toHaveProperty('hashKey');
        expect(parsed.sdkKeys[0]).toHaveProperty('type');
        expect(parsed.sdkKeys[0]).toHaveProperty('environment');
        expect(parsed.sdkKeys[0]).toHaveProperty('createdAt');
        expect(parsed.sdkKeys[0]).toHaveProperty(
          'partialKeyValue',
          'vf_server_abc********'
        );
      });

      it('tracks telemetry for --json', async () => {
        client.setArgv('flags', 'sdk-keys', 'ls', '--json');
        await flags(client);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:sdk-keys',
            value: 'sdk-keys',
          },
          {
            key: 'subcommand:ls',
            value: 'ls',
          },
          {
            key: 'flag:json',
            value: 'TRUE',
          },
        ]);
      });
    });
  });

  describe('add', () => {
    it('tracks `add` subcommand', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'server',
        '--environment',
        'production'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'option:type',
          value: 'server',
        },
        {
          key: 'option:environment',
          value: 'production',
        },
      ]);
    });

    it('creates SDK key successfully', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'server',
        '--environment',
        'production'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });

    it('errors with invalid type', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'invalid',
        '--environment',
        'production'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid type');
    });

    it('errors with invalid environment', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'server',
        '--environment',
        'invalid'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid environment');
    });
  });

  describe('rm', () => {
    it('tracks `rm` subcommand', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'rm',
        defaultSdkKeys[0].hashKey,
        '--yes'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:rm',
          value: 'rm',
        },
        {
          key: 'argument:key',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('deletes SDK key successfully', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'rm',
        defaultSdkKeys[0].hashKey,
        '--yes'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });

    it('errors when SDK key is not found', async () => {
      client.setArgv('flags', 'sdk-keys', 'rm', 'nonexistent-key', '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('SDK key not found');
    });

    it('emits structured JSON in non-interactive mode when hash key is missing', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'flags',
        'sdk-keys',
        'rm',
        '--cwd',
        '/tmp',
        '--non-interactive'
      );

      const exitCode = await flags(client);

      expect(exitCode).toBe(1);
      const out = client.stdout.getFullOutput();
      const parsed = JSON.parse(out);
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('missing_arguments');
      expect(parsed.message).toContain('hash');
      expect(parsed.next).toBeDefined();
      expect(parsed.next.length).toBeGreaterThanOrEqual(1);
      expect(parsed.next[0].command).toContain('flags sdk-keys rm');
      expect(parsed.next[0].command).toContain('<hashKey>');
      expect(parsed.next[0].command).toContain('--cwd');
      expect(parsed.next[0].command).toContain('--non-interactive');
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('add', () => {
    it('emits structured JSON in non-interactive mode when --type is missing', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--cwd',
        '/tmp',
        '--non-interactive'
      );

      const exitCode = await flags(client);

      expect(exitCode).toBe(1);
      const out = client.stdout.getFullOutput();
      const parsed = JSON.parse(out);
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('missing_arguments');
      expect(parsed.message).toContain('--type');
      expect(parsed.next).toBeDefined();
      expect(parsed.next.length).toBeGreaterThan(0);
      expect(parsed.next[0].command).toContain('flags sdk-keys add');
      expect(parsed.next[0].command).toContain('--type');
      expect(parsed.next[0].command).toContain('--cwd');
      expect(parsed.next[0].command).toContain('--non-interactive');
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });
});
