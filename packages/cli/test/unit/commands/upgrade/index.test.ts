import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import upgrade from '../../../../src/commands/upgrade';
import * as configFilesUtil from '../../../../src/util/config/files';

const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

describe('upgrade', () => {
  afterEach(() => {
    writeConfigSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'upgrade';

      client.setArgv(command, '--help');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('--dry-run', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--dry-run');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:dry-run',
          value: 'TRUE',
        },
      ]);
    });

    it('prints upgrade information without executing', async () => {
      client.setArgv('upgrade', '--dry-run');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput('Current version:');
      await expect(client.stderr).toOutput('Installation type:');
      await expect(client.stderr).toOutput('Upgrade command:');
      await expect(client.stderr).toOutput('Automatic updates: Disabled');
    });
  });

  describe('--json', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--json');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });

    it('outputs valid JSON', async () => {
      client.setArgv('upgrade', '--json');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);

      expect(json).toHaveProperty('currentVersion');
      expect(json).toHaveProperty('installationType');
      expect(json).toHaveProperty('upgradeCommand');
      expect(json).toHaveProperty('autoUpdatesEnabled', false);
      expect(['global', 'local']).toContain(json.installationType);
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      client.setArgv('upgrade', '--format', 'json');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs upgrade information as valid JSON that can be piped to jq', async () => {
      client.setArgv('upgrade', '--format', 'json');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const json = JSON.parse(output);

      expect(json).toHaveProperty('currentVersion');
      expect(json).toHaveProperty('installationType');
      expect(json).toHaveProperty('upgradeCommand');
      expect(json).toHaveProperty('autoUpdatesEnabled', false);
    });
  });

  describe('--enable-auto', () => {
    it('enables automatic updates in the global config', async () => {
      client.setArgv('upgrade', '--enable-auto');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(true);
      expect(writeConfigSpy).toHaveBeenCalledWith({
        updates: { auto: true },
      });
      await expect(client.stderr).toOutput('Automatic CLI updates enabled.');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:enable-auto',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--disable-auto', () => {
    it('disables automatic updates in the global config', async () => {
      client.config = { updates: { auto: true } };
      client.setArgv('upgrade', '--disable-auto');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(false);
      expect(writeConfigSpy).toHaveBeenCalledWith({
        updates: { auto: false },
      });
      await expect(client.stderr).toOutput('Automatic CLI updates disabled.');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:disable-auto',
          value: 'TRUE',
        },
      ]);
    });
  });

  it('rejects mutually exclusive auto-update flags', async () => {
    client.setArgv('upgrade', '--enable-auto', '--disable-auto');
    const result = await upgrade(client);

    expect(result).toBe(1);
    await expect(client.stderr).toOutput(
      'Cannot use --enable-auto and --disable-auto together'
    );
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await upgrade(client);
    expect(result).toBe(1);
  });
});
