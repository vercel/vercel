import { existsSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveLocalWorkspace } from '../../src/gateways/local-workspace';
import {
  CantFindConfig,
  CantParseJSONFile,
  DeprecatedNowJson,
  WorkingDirectoryDoesNotExist,
} from '../../src/util/errors-ts';
import { readEarlyConfig } from '../../src/util/get-config';

vi.mock('../../src/util/get-config', () => ({ readEarlyConfig: vi.fn() }));
vi.mock('fs', async importOriginal => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn(),
}));

const cwd = join('/work', 'app');

describe('liveLocalWorkspace (mocked config reader)', () => {
  beforeEach(() => {
    vi.mocked(readEarlyConfig).mockReset();
    vi.mocked(existsSync).mockReset();
  });

  describe('readEarlyLocalConfig', () => {
    it('passes cwd and the local config path', async () => {
      vi.mocked(readEarlyConfig).mockResolvedValue({ scope: 'acme' });

      const result = await liveLocalWorkspace().readEarlyLocalConfig({
        cwd,
        localConfigPath: 'custom.json',
      });

      expect(result).toEqual({ type: 'found', config: { scope: 'acme' } });
      expect(readEarlyConfig).toHaveBeenCalledWith({
        cwd,
        configFile: 'custom.json',
      });
    });

    it('maps CantFindConfig to missing with the searched paths', async () => {
      vi.mocked(readEarlyConfig).mockResolvedValue(
        new CantFindConfig(['~/app/vercel.json'])
      );

      await expect(
        liveLocalWorkspace().readEarlyLocalConfig({ cwd })
      ).resolves.toEqual({
        type: 'missing',
        searchedPaths: ['~/app/vercel.json'],
      });
    });

    it('maps CantParseJSONFile with the file', async () => {
      const cause = new CantParseJSONFile('/work/app/vercel.json', 'line 1');
      vi.mocked(readEarlyConfig).mockResolvedValue(cause);

      await expect(
        liveLocalWorkspace().readEarlyLocalConfig({ cwd })
      ).resolves.toEqual({
        type: 'error',
        error: {
          code: 'CANT_PARSE_JSON_FILE',
          message: cause.message,
          details: { file: '/work/app/vercel.json', cause },
        },
      });
    });

    it('maps DeprecatedNowJson with the docs link', async () => {
      const cause = new DeprecatedNowJson('now.json');
      vi.mocked(readEarlyConfig).mockResolvedValue(cause);

      await expect(
        liveLocalWorkspace().readEarlyLocalConfig({ cwd })
      ).resolves.toEqual({
        type: 'error',
        error: {
          code: 'DEPRECATED_NOW_JSON',
          message: cause.message,
          details: { link: cause.link, cause },
        },
      });
    });

    it('uses the error code of other coded errors', async () => {
      const cause = new WorkingDirectoryDoesNotExist();
      vi.mocked(readEarlyConfig).mockResolvedValue(cause);

      await expect(
        liveLocalWorkspace().readEarlyLocalConfig({ cwd })
      ).resolves.toMatchObject({
        type: 'error',
        error: { code: 'CWD_DOES_NOT_EXIST', details: { cause } },
      });
    });

    it('maps an uncoded error to unknown', async () => {
      const cause = new Error('boom');
      vi.mocked(readEarlyConfig).mockResolvedValue(cause as never);

      await expect(
        liveLocalWorkspace().readEarlyLocalConfig({ cwd })
      ).resolves.toMatchObject({
        type: 'error',
        error: { code: 'unknown', message: 'boom', details: { cause } },
      });
    });
  });

  describe('hasEntry', () => {
    it.each([true, false])('reports existsSync = %s', async exists => {
      vi.mocked(existsSync).mockReturnValue(exists);

      await expect(
        liveLocalWorkspace().hasEntry({ cwd, name: 'vercel.json' })
      ).resolves.toBe(exists);
      expect(existsSync).toHaveBeenCalledWith(join(cwd, 'vercel.json'));
    });
  });
});
