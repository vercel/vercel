import { describe, it, expect, vi, afterEach } from 'vitest';
import telemetry from '../../../../src/commands/telemetry';
import { client } from '../../../mocks/client';
import * as configFilesUtil from '../../../../src/util/config/files';

describe('telemetry', () => {
  const setSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  afterEach(() => {
    setSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'telemetry';

      client.setArgv(command, '--help');
      const exitCodePromise = telemetry(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should show an error with the telemetry help menu when no subcommands are passed', async () => {
    const args: string[] = [];

    client.setArgv('telemetry', ...args);
    const exitCode = await telemetry(client);
    expect(client.stdout).toOutput(
      `Error: No subcommand provided. See help instructions for usage`
    );
    expect(exitCode).toBe(2);
  });

  it('should show an error with the telemetry help menu when an invalid command is passed', async () => {
    const args = ['invalid-command'];

    client.setArgv('telemetry', ...args);
    const exitCode = await telemetry(client);
    expect(client.stdout).toOutput(
      `Error: Invalid subcommand. See help instructions for usage`
    );
    expect(exitCode).toBe(2);
  });

  describe('status', () => {
    it('should show enabled if there is no telemetry value in the global config file', async () => {
      client.config = {};

      const args = ['status'];

      client.setArgv('telemetry', ...args);
      const exitCode = await telemetry(client);
      expect(client.getFullOutput()).toMatchInlineSnapshot(`
        "
        > Telemetry status: Enabled

        > You have opted in to Vercel CLI telemetry

        Learn more: https://vercel.com/docs/cli/about-telemetry
        "
      `);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:status',
          value: 'status',
        },
      ]);
    });
    it('should show enabled if telemetry.enabled = true in the global config file', async () => {
      const args = ['status'];
      client.config = { telemetry: { enabled: true } };

      client.setArgv('telemetry', ...args);
      const exitCode = await telemetry(client);
      expect(client.getFullOutput()).toMatchInlineSnapshot(`
        "
        > Telemetry status: Enabled

        > You have opted in to Vercel CLI telemetry

        Learn more: https://vercel.com/docs/cli/about-telemetry
        "
      `);
      expect(exitCode).toBe(0);
    });
    it('should show disabled if telemetry.enabled = false in the global config file', async () => {
      client.config = { telemetry: { enabled: false } };

      const args = ['status'];

      client.setArgv('telemetry', ...args);
      const exitCode = await telemetry(client);
      expect(client.getFullOutput()).toMatchInlineSnapshot(`
        "
        > Telemetry status: Disabled

        > You have opted out of Vercel CLI telemetry
        > No data will be collected from your machine

        Learn more: https://vercel.com/docs/cli/about-telemetry
        "
      `);
      expect(exitCode).toBe(0);
    });
  });

  describe('enable', () => {
    it('should update the global config file', async () => {
      const args = ['enable'];

      client.setArgv('telemetry', ...args);
      const exitCode = await telemetry(client);
      expect(client.config?.telemetry?.enabled).toBe(true);
      expect(setSpy).toHaveBeenCalledWith({
        telemetry: { enabled: true },
      });
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:enable',
          value: 'enable',
        },
      ]);
    });
  });

  describe('disable', () => {
    it('should update the global config file', async () => {
      const args = ['disable'];

      client.setArgv('telemetry', ...args);
      const exitCode = await telemetry(client);
      expect(client.config?.telemetry?.enabled).toBe(false);
      expect(setSpy).toHaveBeenCalledWith({
        telemetry: { enabled: false },
      });
      expect(exitCode).toBe(0);
    });
  });
});
