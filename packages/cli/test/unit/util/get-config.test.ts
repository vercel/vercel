import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeprecatedNowJson } from '../../../src/util/errors-ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('earlyGetConfig', () => {
  it('rejects deprecated now.json files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vercel-cli-get-config-'));

    try {
      await writeFile(join(cwd, 'now.json'), '{}', 'utf8');
      vi.spyOn(process, 'cwd').mockReturnValue(cwd);

      const { default: earlyGetConfig } = await import(
        '../../../src/util/get-config'
      );
      const result = await earlyGetConfig();

      expect(result).toBeInstanceOf(DeprecatedNowJson);
      expect(result).toMatchObject({
        message:
          'The `now.json` file is deprecated and no longer supported. Please rename it to `vercel.json`.',
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
