import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ensureRuntimeAssetOnDisk,
  getRuntimeAssetsDir,
} from '../../../src/util/runtime-assets';

describe('runtime assets', () => {
  it('places versioned assets under ~/.vercel/runtime/<version>', () => {
    expect(getRuntimeAssetsDir('1.2.3', '/tmp/vercel-home')).toBe(
      join('/tmp/vercel-home', 'runtime', '1.2.3')
    );
  });

  it('copies assets into the runtime dir for child processes', () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-runtime-assets-'));
    const sourceDir = join(root, 'dist');
    mkdirSync(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, 'next-dev-websocket-shim-preload.cjs');
    writeFileSync(sourcePath, 'module.exports = 1;\n');

    const first = ensureRuntimeAssetOnDisk(sourcePath, {
      globalRoot: join(root, 'home'),
      version: '58.7.1',
    });

    writeFileSync(sourcePath, 'module.exports = 2;\n');
    const second = ensureRuntimeAssetOnDisk(sourcePath, {
      globalRoot: join(root, 'home'),
      version: '58.7.1',
    });

    expect(first).toBe(
      join(
        root,
        'home',
        'runtime',
        '58.7.1',
        'next-dev-websocket-shim-preload.cjs'
      )
    );
    expect(second).toBe(first);
    expect(readFileSync(first, 'utf8')).toBe('module.exports = 2;\n');
  });
});
