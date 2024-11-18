import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { checkTelemetryStatus } from '../../../src/util/telemetry/check-status';
import * as configFilesUtil from '../../../src/util/config/files';

import { client } from '../../mocks/client';
import '../../mocks/matchers';
vi.setConfig({ testTimeout: 6 * 60 * 1000 });

describe('checkTelemetryStatus', () => {
  const fileWriterSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  afterEach(() => {
    fileWriterSpy.mockClear();
    vi.unstubAllEnvs();
  });

  describe('first invocation', () => {
    describe('VERCEL_TELEMETRY_DISABLED set', () => {
      beforeEach(() => {
        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '1');
        checkTelemetryStatus({
          config: {},
        });
      });
      it('does not inform the user', async () => {
        await expect(client.stderr).not.toOutput(
          'The Vercel CLI now collects telemetry regarding usage.'
        );
        await expect(client.stderr).not.toOutput(
          'This information is used to shape the CLI roadmap and prioritize features.'
        );
        await expect(client.stderr).not.toOutput(
          "You can learn more, including how to opt-out if you'd not like to participate in this program, by visiting the following URL:"
        );
        await expect(client.stderr).not.toOutput(
          'https://vercel.com/docs/cli/about-telemetry'
        );
      });

      it('does not change opt out status the customer in', async () => {
        expect(fileWriterSpy).not.toHaveBeenCalled();
      });
    });
    describe('VERCEL_TELEMETRY_DISABLED unset', () => {
      beforeEach(() => {
        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);
        checkTelemetryStatus({
          config: {},
        });
      });

      it('informs the user', async () => {
        await expect(client.stderr).toOutput(
          'The Vercel CLI now collects telemetry regarding usage of the CLI.'
        );
        await expect(client.stderr).toOutput(
          'This information is used to shape the CLI roadmap and prioritize features.'
        );
        await expect(client.stderr).toOutput(
          "You can learn more, including how to opt-out if you'd not like to participate in this program, by visiting the following URL:"
        );
        await expect(client.stderr).toOutput(
          'https://vercel.com/docs/cli/about-telemetry'
        );
      });

      it('opts the customer in', async () => {
        expect(fileWriterSpy).toHaveBeenCalledWith({
          telemetry: { enabled: true },
        });
      });
    });

    describe('subsequent invocations', () => {
      beforeEach(() => {
        checkTelemetryStatus({
          config: {
            telemetry: {
              enabled: true,
            },
          },
        });
      });

      it('does not inform the user', async () => {
        expect(client.getFullOutput()).toEqual('');
      });

      it('does not change opt out status the customer in', async () => {
        expect(fileWriterSpy).not.toHaveBeenCalled();
      });
    });

    describe('subsequent invocations after opting status change', () => {
      beforeEach(() => {
        checkTelemetryStatus({
          config: {
            telemetry: {
              enabled: false,
            },
          },
        });
      });

      it('does not inform the user', async () => {
        expect(client.getFullOutput()).toEqual('');
      });

      it('does not change opt out status the customer in', async () => {
        expect(fileWriterSpy).not.toHaveBeenCalled();
      });
    });
  });
});
