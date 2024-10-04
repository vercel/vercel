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
  });

  describe('first invocation', () => {
    beforeEach(() => {
      checkTelemetryStatus({
        config: {},
        // @ts-ignore; client and mock client don't match types. know issue.
        client,
      });
    });

    it('informs the user', async () => {
      await expect(client.stderr).toOutput(
        'The Vercel CLI now collects telemetry regarding usage.'
      );
      await expect(client.stderr).toOutput(
        'This information is used to shape the CLI roadmap and prioritize features.'
      );
      await expect(client.stderr).toOutput(
        "You can learn more, including how to opt-out if you'd not like to participate in this program, by visiting the following URL:"
      );
      await expect(client.stderr).toOutput(
        'https://vercel.com/docs/cli/about-telemerty'
      );
    });

    it('opts the customer in', async () => {
      expect(fileWriterSpy).toHaveBeenCalledWith(client.output, {
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
        // @ts-ignore; client and mock client don't match types. know issue.
        client,
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
        'https://vercel.com/docs/cli/about-telemerty'
      );
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
        // @ts-ignore; client and mock client don't match types. know issue.
        client,
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
        'https://vercel.com/docs/cli/about-telemerty'
      );
    });

    it('does not change opt out status the customer in', async () => {
      expect(fileWriterSpy).not.toHaveBeenCalled();
    });
  });
});
