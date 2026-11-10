import { describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { realpath } from 'node:fs/promises';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { validateBuildOutput } from '../../../../src/util/describe/validate-build-output';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, realpath: vi.fn(actual.realpath) };
});

describe.skipIf(process.platform === 'win32')('validateBuildOutput', () => {
  it('checks a source shared by many functions once', async () => {
    const root = setupTmpDir();
    const outputDir = join(root, '.vercel/output');
    const shared = 'node_modules/next/index.js';
    await fs.outputFile(join(root, shared), '');
    await fs.outputJSON(join(outputDir, 'config.json'), { version: 3 });
    for (let i = 0; i < 20; i++) {
      await fs.outputJSON(
        join(outputDir, `functions/route-${i}.func/.vc-config.json`),
        {
          runtime: 'nodejs22.x',
          handler: 'index.js',
          filePathMap: { [shared]: shared },
        }
      );
    }

    vi.mocked(realpath).mockClear();
    await validateBuildOutput({ outputDir, repoRootPath: root });

    const calls = vi
      .mocked(realpath)
      .mock.calls.filter(([path]) => path === join(root, shared));
    expect(calls).toHaveLength(1);
  });
});
