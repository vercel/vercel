import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { glob } from 'glob';
import pkgConfig from '../../../pkg.config.mjs';
import {
  installNativeEsbuildLoader,
  loadEsbuildSymbol,
} from '../../../native-esbuild.js';

const originalBinaryPath = process.env.ESBUILD_BINARY_PATH;
let root: string | undefined;

afterEach(async () => {
  Reflect.deleteProperty(globalThis, loadEsbuildSymbol);
  if (originalBinaryPath === undefined) {
    delete process.env.ESBUILD_BINARY_PATH;
  } else {
    process.env.ESBUILD_BINARY_PATH = originalBinaryPath;
  }
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('installNativeEsbuildLoader()', () => {
  it.each([
    { platform: 'linux', arch: 'x64', nested: false },
    { platform: 'linux', arch: 'x64', nested: true },
    { platform: 'win32', arch: 'arm64', nested: false },
    { platform: 'win32', arch: 'arm64', nested: true },
  ] as const)('materializes the matching embedded executable lazily ($platform, nested: $nested)', async ({
    platform,
    arch,
    nested,
  }) => {
    root = await mkdtemp(join(tmpdir(), 'vercel-native-esbuild-'));
    const esbuildRoot = join(root, 'node_modules/esbuild');
    await mkdir(join(esbuildRoot, 'lib'), { recursive: true });
    await writeFile(
      join(esbuildRoot, 'package.json'),
      JSON.stringify({ name: 'esbuild', main: 'lib/main.js' })
    );
    await writeFile(join(esbuildRoot, 'lib/main.js'), '');
    const binaryPath = `node_modules/@esbuild/${platform}-${arch}/${
      platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'
    }`;
    const executable = join(nested ? esbuildRoot : root, binaryPath);
    await mkdir(join(executable, '..'), { recursive: true });
    await writeFile(executable, 'embedded-esbuild');
    if (nested) {
      // A different esbuild version may have hoisted its binary to the root.
      const unrelatedExecutable = join(root, binaryPath);
      await mkdir(join(unrelatedExecutable, '..'), { recursive: true });
      await writeFile(unrelatedExecutable, 'wrong-esbuild-version');
    }

    const assets = await glob(pkgConfig.pkg.assets, { cwd: root });
    expect(assets.map(asset => join(root!, asset))).toContain(executable);

    let selectedBinary: string | undefined;
    const esbuild = { build: () => undefined };
    installNativeEsbuildLoader({
      packageRootUrl: pathToFileURL(join(root, 'native-esbuild.js')).href,
      cacheRoot: join(root, 'cache'),
      platform,
      arch,
      loadEsbuild: () => {
        selectedBinary = process.env.ESBUILD_BINARY_PATH;
        return esbuild;
      },
    });

    expect(selectedBinary).toBeUndefined();
    const loader = Reflect.get(globalThis, loadEsbuildSymbol);
    expect(loader()).toBe(esbuild);
    expect(await readFile(selectedBinary!, 'utf8')).toBe('embedded-esbuild');
    if (process.platform !== 'win32') {
      expect((await stat(selectedBinary!)).mode & 0o111).not.toBe(0);
    }
    expect(process.env.ESBUILD_BINARY_PATH).toBe(originalBinaryPath);
  });

  it('preserves an explicit ESBUILD_BINARY_PATH', async () => {
    root = await mkdtemp(join(tmpdir(), 'vercel-native-esbuild-'));
    process.env.ESBUILD_BINARY_PATH = '/custom/esbuild';
    let selectedBinary: string | undefined;
    installNativeEsbuildLoader({
      packageRootUrl: pathToFileURL(join(root, 'native-esbuild.js')).href,
      cacheRoot: join(root, 'cache'),
      loadEsbuild: () => {
        selectedBinary = process.env.ESBUILD_BINARY_PATH;
        return {};
      },
    });

    Reflect.get(globalThis, loadEsbuildSymbol)();
    expect(selectedBinary).toBe('/custom/esbuild');
    expect(process.env.ESBUILD_BINARY_PATH).toBe('/custom/esbuild');
  });
});
