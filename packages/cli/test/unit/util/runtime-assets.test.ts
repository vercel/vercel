import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getRuntimeAssetsDir,
  materializeRuntimeAsset,
  readRuntimeAsset,
} from '../../../src/util/runtime-assets';

describe('runtime assets', () => {
  it('places versioned assets under ~/.vercel/runtime-assets/<version>', () => {
    expect(getRuntimeAssetsDir('1.2.3', '/tmp/vercel-home')).toBe(
      join('/tmp/vercel-home', 'runtime-assets', '1.2.3')
    );
  });

  it('materializes declared assets at an intentional category path', () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-runtime-assets-'));
    const options = {
      globalRoot: join(root, 'home'),
      version: '58.7.1',
    };

    const first = materializeRuntimeAsset('nextDevWebSocketPreload', options);
    const expectedContents = readFileSync(first, 'utf8');

    writeFileSync(first, 'stale same-version contents\n');
    const second = materializeRuntimeAsset('nextDevWebSocketPreload', options);

    expect(first).toBe(
      join(
        root,
        'home',
        'runtime-assets',
        '58.7.1',
        'node-preloads',
        'next-dev-websocket.cjs'
      )
    );
    expect(second).toBe(first);
    expect(readFileSync(second, 'utf8')).toBe(expectedContents);
  });

  it('finds assets from nested built command entry points', () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-runtime-assets-build-'));
    const asset = join(
      root,
      'dist',
      'runtime-assets',
      'node-preloads',
      'next-dev-websocket.cjs'
    );
    mkdirSync(join(root, 'dist', 'runtime-assets', 'node-preloads'), {
      recursive: true,
    });
    writeFileSync(asset, 'preload contents');

    expect(
      readRuntimeAsset(
        'node-preloads/next-dev-websocket.cjs',
        join(root, 'dist', 'commands', 'dev')
      ).toString()
    ).toBe('preload contents');
  });

  it('rejects unknown asset IDs at runtime', () => {
    expect(() =>
      materializeRuntimeAsset('unknown' as 'nextDevWebSocketPreload')
    ).toThrow('Unknown runtime asset: unknown');
  });
});
