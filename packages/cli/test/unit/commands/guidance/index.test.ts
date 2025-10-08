import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import guidance from '../../../../src/commands/guidance';
import { client } from '../../../mocks/client';
import * as configFilesUtil from '../../../../src/util/config/files';

describe('guidance', () => {
  const setSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  afterEach(() => {
    setSpy.mockClear();
    vi.unstubAllEnvs();
  });

  describe('FF_GUIDANCE_MODE unset', () => {
    it('exits with error', async () => {
      const command = 'guidance';

      client.setArgv(command, '--help');
      const exitCodePromise = guidance(client);
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('FF_GUIDANCE_MODE set', () => {
    beforeEach(() => {
      vi.stubEnv('FF_GUIDANCE_MODE', '1');
    });

    describe('--help', () => {
      it('tracks guidance', async () => {
        const command = 'guidance';

        client.setArgv(command, '--help');
        const exitCodePromise = guidance(client);
        await expect(exitCodePromise).resolves.toEqual(2);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: command,
          },
        ]);
      });
    });

    it('should show an error with the guidance help menu when no subcommands are passed', async () => {
      const args: string[] = [];

      client.setArgv('guidance', ...args);
      const exitCode = await guidance(client);
      expect(client.stdout).toOutput(
        `Error: No subcommand provided. See help instructions for usage`
      );
      expect(exitCode).toBe(2);
    });

    it('should show an error with the guidance help menu when an invalid command is passed', async () => {
      const args = ['invalid-command'];

      client.setArgv('guidance', ...args);
      const exitCode = await guidance(client);
      expect(client.stdout).toOutput(
        `Error: Invalid subcommand. See help instructions for usage`
      );
      expect(exitCode).toBe(2);
    });

    describe('status', () => {
      it('should show enabled if there is no guidance value in the global config file', async () => {
        client.config = {};

        const args = ['status'];

        client.setArgv('guidance', ...args);
        const exitCode = await guidance(client);
        expect(client.getFullOutput()).toMatchInlineSnapshot(`
          "
          > Guidance status: Enabled

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

      it('should show enabled if guidance.enabled = true in the global config file', async () => {
        const args = ['status'];
        client.config = { guidance: { enabled: true } };

        client.setArgv('guidance', ...args);
        const exitCode = await guidance(client);
        expect(client.getFullOutput()).toMatchInlineSnapshot(`
          "
          > Guidance status: Enabled

          "
        `);
        expect(exitCode).toBe(0);
      });

      it('should show disabled if guidance.enabled = false in the global config file', async () => {
        client.config = { guidance: { enabled: false } };

        const args = ['status'];

        client.setArgv('guidance', ...args);
        const exitCode = await guidance(client);
        expect(client.getFullOutput()).toMatchInlineSnapshot(`
          "
          > Guidance status: Disabled

          "
        `);
        expect(exitCode).toBe(0);
      });
    });

    describe('enable', () => {
      it('should update the global config file', async () => {
        const args = ['enable'];

        client.setArgv('guidance', ...args);
        const exitCode = await guidance(client);
        expect(client.config?.guidance?.enabled).toBe(true);
        expect(setSpy).toHaveBeenCalledWith({
          guidance: { enabled: true },
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

        client.setArgv('guidance', ...args);
        const exitCode = await guidance(client);
        expect(client.config?.guidance?.enabled).toBe(false);
        expect(setSpy).toHaveBeenCalledWith({
          guidance: { enabled: false },
        });
        expect(exitCode).toBe(0);
      });
    });
  });
});
