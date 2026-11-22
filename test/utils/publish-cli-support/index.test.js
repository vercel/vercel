import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cliSupportName,
  cliSupportOs,
  cliSupportPackageJson,
} from '../../../utils/publish-cli-support.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

async function nativeTargets() {
  const source = await readFile(
    join(repoRoot, 'packages', 'cli', 'src', 'vc.js'),
    'utf8'
  );
  const list = source.match(/const NATIVE_TARGETS = \[([^\]]*)\]/)[1];
  return [...list.matchAll(/'([^']+)'/g)].map(([, target]) => target);
}

describe('@vercel/cli-support', () => {
  it('installs only on operating systems without any native target', async () => {
    const nativeOs = new Set((await nativeTargets()).map(t => t.split('-')[0]));
    expect(cliSupportOs.every(os => os.startsWith('!'))).toBe(true);
    expect(cliSupportOs.map(os => os.slice(1)).sort()).toEqual(
      [...nativeOs].sort()
    );
  });

  it('is published from the vercel package with its os filter and no bin', () => {
    const pkg = cliSupportPackageJson({
      name: 'vercel',
      version: '65.3.0',
      bin: { vercel: './dist/vc.js' },
      scripts: { prepack: 'x' },
      files: ['dist'],
      dependencies: { esbuild: '0.27.0' },
      optionalDependencies: { '@vercel/vc-native-linux-x64': '65.3.0' },
    });
    expect(pkg).toMatchObject({
      name: cliSupportName,
      version: '65.3.0',
      files: ['dist'],
      dependencies: { esbuild: '0.27.0' },
      os: cliSupportOs,
    });
    expect(pkg).not.toHaveProperty('bin');
    expect(pkg).not.toHaveProperty('scripts');
    expect(pkg).not.toHaveProperty('optionalDependencies');
  });
});
