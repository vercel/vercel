import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { checkGuidanceStatus } from '../../../src/util/guidance/check-status';
import * as configFilesUtil from '../../../src/util/config/files';

import { client } from '../../mocks/client';
import '../../mocks/matchers';
vi.setConfig({ testTimeout: 6 * 60 * 1000 });

describe('checkGuidanceStatus', () => {
  const fileWriterSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  beforeEach(() => {
    vi.stubEnv('CI', undefined);
  });

  afterEach(() => {
    fileWriterSpy.mockClear();
    vi.unstubAllEnvs();
  });

  describe('FF_GUIDANCE_MODE unset', () => {
    beforeEach(() => {
      checkGuidanceStatus({
        config: {},
      });
    });

    it('does not inform the user', async () => {
      await expect(client.stderr).not.toOutput(
        'The Vercel CLI can suggest common follow-up commands and steps to help guide new users.'
      );
      await expect(client.stderr).not.toOutput(
        'You cand disable this feature by running:'
      );
      await expect(client.stderr).not.toOutput('vercel guidance disable');
      await expect(client.stderr).not.toOutput(
        'or by setting VERCEL_GUIDANCE_DISABLED=1'
      );
    });
  });

  describe('FF_GUIDANCE_MODE set', () => {
    beforeEach(() => {
      vi.stubEnv('FF_GUIDANCE_MODE', '1');
    });

    describe('first invocation', () => {
      describe('VERCEL_GUIDANCE_DISABLED set', () => {
        beforeEach(() => {
          vi.stubEnv('VERCEL_GUIDANCE_DISABLED', '1');
          checkGuidanceStatus({
            config: {},
          });
        });
        it('does not inform the user', async () => {
          await expect(client.stderr).not.toOutput(
            'The Vercel CLI can suggest common follow-up commands and steps to help guide new users.'
          );
          await expect(client.stderr).not.toOutput(
            'You can disable this feature by running:'
          );
          await expect(client.stderr).not.toOutput('vercel guidance disable');
          await expect(client.stderr).not.toOutput(
            'or by setting VERCEL_GUIDANCE_DISABLED=1'
          );
        });

        it('does not change opt out status the customer in', async () => {
          expect(fileWriterSpy).not.toHaveBeenCalled();
        });
      });

      describe('VERCEL_GUIDANCE_DISABLED unset', () => {
        beforeEach(() => {
          vi.stubEnv('VERCEL_GUIDANCE_DISABLED', undefined);
          checkGuidanceStatus({
            config: {},
          });
        });

        it('informs the user', async () => {
          await expect(client.stderr).toOutput(
            'The Vercel CLI can suggest common follow-up commands and steps to help guide new users.'
          );
          await expect(client.stderr).toOutput(
            'You can disable this feature by running:'
          );
          await expect(client.stderr).toOutput('vercel guidance disable');
          await expect(client.stderr).toOutput(
            'or by setting VERCEL_GUIDANCE_DISABLED=1'
          );
        });

        it('opts the customer in', async () => {
          expect(fileWriterSpy).toHaveBeenCalledWith({
            guidance: {
              enabled: true,
            },
          });
        });
      });

      describe('subsequent invocations', () => {
        beforeEach(() => {
          checkGuidanceStatus({
            config: {
              guidance: {
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
          checkGuidanceStatus({
            config: {
              guidance: {
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
});
