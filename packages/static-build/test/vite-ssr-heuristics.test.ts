import { describe, expect, it } from 'vitest';
import { outputFile, remove } from 'fs-extra';
import path from 'path';
import {
  packageDeclaresLikelyViteSsr,
  shouldInjectNitroForProject,
  viteConfigSourceDeclaresServerEnvironment,
} from '../src/utils/vite-ssr-heuristics';

describe('vite-ssr-heuristics', () => {
  const workPath = path.join(
    __dirname,
    'build-fixtures',
    '17-vite-environments'
  );

  afterEach(async () => {
    await Promise.all([
      remove(path.join(workPath, 'vite.config.ts')),
      remove(path.join(workPath, 'vite.config.js')),
    ]);
  });

  it('detects TanStack Start from package.json', () => {
    expect(
      packageDeclaresLikelyViteSsr({
        dependencies: { '@tanstack/react-start': '1.0.0', vite: '6.0.0' },
      })
    ).toBe(true);
  });

  it('skips SvelteKit', () => {
    expect(
      packageDeclaresLikelyViteSsr({
        dependencies: { '@sveltejs/kit': '2.0.0', vite: '6.0.0' },
      })
    ).toBe(false);
  });

  it('detects server environment from vite.config source', async () => {
    await outputFile(
      path.join(workPath, 'vite.config.ts'),
      `import { tanstackStart } from '@tanstack/react-start/plugin/vite';
export default { plugins: [tanstackStart()] };`
    );
    expect(viteConfigSourceDeclaresServerEnvironment(workPath)).toBe(true);
    expect(
      shouldInjectNitroForProject(workPath, { dependencies: { vite: '6' } })
    ).toBe(true);
  });

  it('returns false for plain vite with no SSR signals', () => {
    expect(
      shouldInjectNitroForProject(workPath, {
        dependencies: { vite: '6.0.0', react: '19.0.0' },
      })
    ).toBe(false);
  });
});
