import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { injectNativeOptionalDeps } from '../../../utils/inject-native-optional-deps.mjs';
import { platforms as allPlatforms } from '../../../packages/vc-native/scripts/platforms.mjs';
import { cliSupportName } from '../../../utils/publish-cli-support.mjs';

// Windows runs only the Node CLI, so its native packages are not pinned.
const windowsPlatforms = allPlatforms.filter(p => p.os.includes('win32'));
const platforms = allPlatforms.filter(p => !p.os.includes('win32'));
const injected = [...platforms, { name: cliSupportName }];

const tempDirs = [];

async function createCliPackage({
  version = '59.11.7',
  optionalDependencies,
} = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'inject-native-optional-deps-'));
  tempDirs.push(cwd);
  const cliDir = join(cwd, 'packages', 'cli');
  await mkdir(cliDir, { recursive: true });
  const cliPackageJsonPath = join(cliDir, 'package.json');
  const pkg = { name: 'vercel', version };
  if (optionalDependencies) {
    pkg.optionalDependencies = optionalDependencies;
  }
  await writeFile(cliPackageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  return { cliPackageJsonPath };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true }))
  );
});

describe('injectNativeOptionalDeps', () => {
  it('skips injection when native deps are intentionally disabled', async () => {
    const { cliPackageJsonPath } = await createCliPackage();
    const result = await injectNativeOptionalDeps({
      cliPackageJsonPath,
      skipNativeDeps: true,
      isPublished: async () => {
        throw new Error(
          'npm should not be consulted when native deps are skipped'
        );
      },
    });

    expect(result).toEqual({
      skipped: true,
      reason: 'VERCEL_SKIP_NATIVE_DEPS',
    });
    const pkg = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));
    expect(pkg.optionalDependencies).toBeUndefined();
  });

  it('skips injection when this vercel version is already on npm', async () => {
    const { cliPackageJsonPath } = await createCliPackage({
      version: '59.11.7',
    });
    const viewed = [];
    const result = await injectNativeOptionalDeps({
      cliPackageJsonPath,
      isPublished: async spec => {
        viewed.push(spec);
        return spec === 'vercel@59.11.7';
      },
    });

    expect(result).toEqual({
      skipped: true,
      reason: 'already-published',
      version: '59.11.7',
    });
    expect(viewed).toEqual(['vercel@59.11.7']);
    const pkg = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));
    expect(pkg.optionalDependencies).toBeUndefined();
  });

  it('injects native optionalDependencies without waiting for npm to show them', async () => {
    const { cliPackageJsonPath } = await createCliPackage({
      version: '59.11.7',
    });
    const viewed = [];
    const result = await injectNativeOptionalDeps({
      cliPackageJsonPath,
      isPublished: async spec => {
        viewed.push(spec);
        return false;
      },
    });

    expect(result.skipped).toBe(false);
    expect(result.version).toBe('59.11.7');
    expect(viewed).toEqual(['vercel@59.11.7']);
    expect(result.packages).toEqual(
      platforms.map(({ name }) => `${name}@59.11.7`)
    );

    const pkg = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));
    expect(Object.keys(pkg.optionalDependencies)).toEqual(
      platforms.map(({ name }) => name).sort()
    );
    for (const { name } of platforms) {
      expect(pkg.optionalDependencies[name]).toBe('59.11.7');
    }
    // A release pins @vercel/cli-support only after it is on npm.
    expect(pkg.optionalDependencies).not.toHaveProperty(cliSupportName);
    expect(windowsPlatforms.map(({ name }) => name)).toEqual([
      '@vercel/vc-native-win32-arm64',
      '@vercel/vc-native-win32-x64',
    ]);
    for (const { name } of windowsPlatforms) {
      expect(pkg.optionalDependencies).not.toHaveProperty(name);
    }
  });

  it('also pins @vercel/cli-support when includeCliSupport is set', async () => {
    const { cliPackageJsonPath } = await createCliPackage({
      version: '59.11.7',
    });
    const result = await injectNativeOptionalDeps({
      cliPackageJsonPath,
      includeCliSupport: true,
      isPublished: async () => false,
    });

    expect(result.packages).toEqual(
      injected.map(({ name }) => `${name}@59.11.7`)
    );
    const pkg = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));
    expect(Object.keys(pkg.optionalDependencies)).toEqual(
      injected.map(({ name }) => name).sort()
    );
    expect(pkg.optionalDependencies[cliSupportName]).toBe('59.11.7');
  });

  it('preserves existing optionalDependencies while pinning native versions', async () => {
    const { cliPackageJsonPath } = await createCliPackage({
      version: '59.11.7',
      optionalDependencies: {
        fsevents: '^2.3.2',
        [platforms[0].name]: '0.0.0',
      },
    });

    await injectNativeOptionalDeps({
      cliPackageJsonPath,
      isPublished: async () => false,
    });

    const pkg = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));
    expect(pkg.optionalDependencies.fsevents).toBe('^2.3.2');
    expect(pkg.optionalDependencies[platforms[0].name]).toBe('59.11.7');
  });
});
