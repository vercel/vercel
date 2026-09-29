import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultGlobalConfig } from '@vercel/cli-config';
import pkg from '../../src/util/pkg';
import { DEFAULT_CWD } from '../fakes/in-memory-context';
import { runScenario, useNetworkGuard } from './harness';

useNetworkGuard();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('bootstrap', () => {
  it('prints the version to stdout for --version', async () => {
    const { exitCode, stdout } = await runScenario(['--version']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${pkg.version}\n`);
  });

  it.each([['help'], ['-h']])('prints help for bare `%s`', async arg => {
    const { exitCode, stderr, stdout } = await runScenario([arg]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain('vercel [options] <command | path>');
    expect(stdout).toBe('');
  });

  it('writes the default global config when none exists', async () => {
    const { exitCode, stderr, fakes } = await runScenario(['whoami'], {
      cliConfig: { globalConfig: 'missing' },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Logged out.');
    expect(fakes.cliConfig.globalConfig).toMatchObject(defaultGlobalConfig);
  });

  it('shows the telemetry notice and enables telemetry on first run', async () => {
    const { stderr, fakes } = await runScenario(['whoami'], {
      cliConfig: { globalConfig: {} },
    });

    expect(stderr).toContain(
      'The Vercel CLI now collects telemetry regarding usage of the CLI.'
    );
    expect(fakes.cliConfig.globalConfig?.telemetry).toEqual({ enabled: true });
  });

  it('skips the telemetry notice when VERCEL_TELEMETRY_DISABLED is set', async () => {
    const { stderr, fakes } = await runScenario(
      ['whoami'],
      { cliConfig: { globalConfig: {} } },
      { env: { VERCEL_TELEMETRY_DISABLED: '1' } }
    );

    expect(stderr).not.toContain('collects telemetry');
    expect(fakes.cliConfig.globalConfig?.telemetry).toBeUndefined();
  });

  it('fails when the global config cannot be read', async () => {
    const { exitCode, stderr } = await runScenario(['whoami'], {
      cliConfig: {
        globalConfigReadError: {
          code: 'EACCES',
          message: 'EACCES: permission denied',
        },
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'An unexpected error occurred while trying to read the config in'
    );
    expect(stderr).toContain('EACCES: permission denied');
  });

  it('rejects an invalid --api URL', async () => {
    const { exitCode, stderr } = await runScenario([
      'whoami',
      '--api',
      'not-a-url',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'Please provide a valid URL instead of not-a-url.'
    );
  });

  it('rejects a --token with invalid characters', async () => {
    const { exitCode, stderr } = await runScenario([
      'whoami',
      '--token',
      'abc def',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'but its contents are invalid. Must not contain: " "'
    );
  });

  it('rejects an empty --token', async () => {
    const { exitCode, stderr } = await runScenario(['whoami', '--token', '']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("but it's missing a value");
  });

  it('fails when the local vercel.json cannot be parsed', async () => {
    const file = join(DEFAULT_CWD, 'vercel.json');
    const { exitCode, stderr } = await runScenario(['whoami'], {
      workspace: { files: { [file]: 'invalid-json' } },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Couldn't parse JSON file ${file}.`);
  });

  it('fails when --local-config points to a missing file', async () => {
    const { exitCode, stderr } = await runScenario([
      'whoami',
      '--local-config',
      'missing.json',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Couldn't find a project configuration file at");
    expect(stderr).toContain(join(DEFAULT_CWD, 'missing.json'));
  });

  it('delivers telemetry events through the telemetry gateway', async () => {
    // `TelemetryEventStore.enabled` still reads `process.env` directly.
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);

    const { fakes } = await runScenario(['whoami'], {
      cliConfig: { globalConfig: { telemetry: { enabled: true } } },
      telemetry: { deviceId: 'device_1' },
    });

    expect(fakes.telemetry.sent).toHaveLength(1);
    const [payload] = fakes.telemetry.sent;
    expect(payload.headers['x-vercel-cli-session-id']).toBe('session_fake');
    expect(payload.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'command:whoami' }),
        expect.objectContaining({ key: 'device_id', value: 'device_1' }),
      ])
    );
  });

  it('does not deliver telemetry when it is disabled in the config', async () => {
    const { fakes } = await runScenario(['whoami']);

    expect(fakes.telemetry.sent).toEqual([]);
  });
});
