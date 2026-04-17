import { afterEach, describe, it, expect } from 'vitest';
import { join } from 'path';
import { ensureDir, realpath, remove, outputJSON, writeFile } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { client } from '../../../mocks/client';
import {
  importBuilders,
  resolveBuilders,
  setPeerDependenciesForTesting,
  resetPeerDependenciesCache,
} from '../../../../src/util/build/import-builders';
import * as installBuildersModule from '../../../../src/util/build/install-builders';
import vercelNextPkg from '@vercel/next/package.json';

vi.mock('../../../../src/util/build/install-builders', async importOriginal => {
  const actual = await (
    importOriginal as () => Promise<typeof installBuildersModule>
  )();
  return {
    ...actual,
    installBuilders: vi.fn(
      (...args: Parameters<typeof actual.installBuilders>) =>
        actual.installBuilders(...args)
    ),
  };
});
import vercelNodePkg from '@vercel/node/package.json';
import { vi } from 'vitest';
import { isWindows } from '../../../helpers/is-windows';

// these tests can take upwards of 190s on macos-latest
vi.setConfig({ testTimeout: 4 * 60 * 1000 });

const repoRoot = join(__dirname, '../../../../../..');

describe('importBuilders()', () => {
  it('should import built-in Builders', async () => {
    const specs = new Set(['@vercel/node', '@vercel/next']);
    const builders = await importBuilders(specs, process.cwd());
    expect(builders.size).toEqual(2);
    expect(builders.get('@vercel/node')?.pkg).toMatchObject(vercelNodePkg);
    expect(builders.get('@vercel/next')?.pkg).toMatchObject(vercelNextPkg);
    expect(builders.get('@vercel/node')?.pkgPath).toEqual(
      join(repoRoot, 'packages/node/package.json')
    );
    expect(builders.get('@vercel/next')?.pkgPath).toEqual(
      join(repoRoot, 'packages/next/package.json')
    );
    expect(typeof builders.get('@vercel/node')?.builder.build).toEqual(
      'function'
    );
    expect(typeof builders.get('@vercel/next')?.builder.build).toEqual(
      'function'
    );
  });

  it('should import built-in Builders using `@latest`', async () => {
    const specs = new Set(['@vercel/node@latest', '@vercel/next@latest']);
    const builders = await importBuilders(specs, process.cwd());
    expect(builders.size).toEqual(2);
    expect(builders.get('@vercel/node@latest')?.pkg).toMatchObject(
      vercelNodePkg
    );
    expect(builders.get('@vercel/next@latest')?.pkg).toMatchObject(
      vercelNextPkg
    );
    expect(builders.get('@vercel/node@latest')?.pkgPath).toEqual(
      join(repoRoot, 'packages/node/package.json')
    );
    expect(builders.get('@vercel/next@latest')?.pkgPath).toEqual(
      join(repoRoot, 'packages/next/package.json')
    );
    expect(typeof builders.get('@vercel/node@latest')?.builder.build).toEqual(
      'function'
    );
    expect(typeof builders.get('@vercel/next@latest')?.builder.build).toEqual(
      'function'
    );
  });

  it('should import built-in Builders using `@canary`', async () => {
    const specs = new Set(['@vercel/node@canary', '@vercel/next@canary']);
    const builders = await importBuilders(specs, process.cwd());
    expect(builders.size).toEqual(2);
    expect(builders.get('@vercel/node@canary')?.pkg).toMatchObject(
      vercelNodePkg
    );
    expect(builders.get('@vercel/next@canary')?.pkg).toMatchObject(
      vercelNextPkg
    );
    expect(builders.get('@vercel/node@canary')?.pkgPath).toEqual(
      join(repoRoot, 'packages/node/package.json')
    );
    expect(builders.get('@vercel/next@canary')?.pkgPath).toEqual(
      join(repoRoot, 'packages/next/package.json')
    );
    expect(typeof builders.get('@vercel/node@canary')?.builder.build).toEqual(
      'function'
    );
    expect(typeof builders.get('@vercel/next@canary')?.builder.build).toEqual(
      'function'
    );
  });

  // this test creates symlinks which require admin by default on Windows
  it.skipIf(isWindows)(
    'should install and import 1st party Builders with explicit version',
    async () => {
      const cwd = await getWriteableDirectory();
      try {
        const spec = '@vercel/node@2.0.0';
        const specs = new Set([spec]);
        const builders = await importBuilders(specs, cwd);
        expect(builders.size).toEqual(1);
        expect(builders.get(spec)?.pkg.name).toEqual('@vercel/node');
        expect(builders.get(spec)?.pkg.version).toEqual('2.0.0');
        expect(builders.get(spec)?.pkgPath).toEqual(
          join(cwd, '.vercel/builders/node_modules/@vercel/node/package.json')
        );
        expect(typeof builders.get(spec)?.builder.build).toEqual('function');
        await expect(client.stderr).toOutput(
          '> Installing Builder: @vercel/node'
        );
        await expect(client.stderr).not.toOutput('npm WARN deprecated');
      } finally {
        await remove(cwd);
      }
    }
  );

  // this test creates symlinks which require admin by default on Windows
  it.skipIf(isWindows)(
    'should install and import 3rd party Builders',
    async () => {
      const cwd = await getWriteableDirectory();
      try {
        const spec = 'vercel-deno@2.0.1';
        const tarballSpec = 'https://files-roan-zeta.vercel.app';
        const specs = new Set([spec, tarballSpec]);
        const builders = await importBuilders(specs, cwd);
        expect(builders.size).toEqual(2);
        expect(builders.get(spec)?.pkg.name).toEqual('vercel-deno');
        expect(builders.get(spec)?.pkg.version).toEqual('2.0.1');
        expect(builders.get(spec)?.pkgPath).toEqual(
          join(cwd, '.vercel/builders/node_modules/vercel-deno/package.json')
        );
        expect(typeof builders.get(spec)?.builder.build).toEqual('function');
        expect(builders.get(tarballSpec)?.pkg.name).toEqual('vercel-bash');
        expect(builders.get(tarballSpec)?.pkg.version).toEqual('4.1.0');
        expect(builders.get(tarballSpec)?.pkgPath).toEqual(
          join(cwd, '.vercel/builders/node_modules/vercel-bash/package.json')
        );
        expect(typeof builders.get(tarballSpec)?.builder.build).toEqual(
          'function'
        );
        await expect(client.stderr).toOutput(
          `> Installing Builders: vercel-deno@2.0.1, ${tarballSpec}`
        );
      } finally {
        await remove(cwd);
      }
    }
  );

  // this test creates symlinks which require admin by default on Windows
  it.skipIf(isWindows)(
    'should install and import legacy `@now/build-utils` Builders',
    async () => {
      const cwd = await getWriteableDirectory();
      try {
        const spec = '@frontity/now@1.2.0';
        const specs = new Set([spec]);
        const builders = await importBuilders(specs, cwd);
        expect(builders.size).toEqual(1);
        expect(builders.get(spec)?.pkg.name).toEqual('@frontity/now');
        expect(builders.get(spec)?.pkg.version).toEqual('1.2.0');
        expect(builders.get(spec)?.pkgPath).toEqual(
          join(cwd, '.vercel/builders/node_modules/@frontity/now/package.json')
        );
        expect(typeof builders.get(spec)?.builder.build).toEqual('function');
      } finally {
        await remove(cwd);
      }
    }
  );

  it('should throw when importing a Builder that is not on npm registry', async () => {
    let err: Error | undefined;
    const cwd = await getWriteableDirectory();
    try {
      const spec = '@vercel/does-not-exist@0.0.1';
      const specs = new Set([spec]);
      await importBuilders(specs, cwd);
    } catch (_err: unknown) {
      err = _err as Error;
    } finally {
      await remove(cwd);
    }

    if (!err) {
      throw new Error('Expected `err` to be defined');
    }

    expect(err.message).toEqual(
      'The package `@vercel/does-not-exist` is not published on the npm registry'
    );
    expect((err as any).link).toEqual(
      'https://vercel.link/builder-dependencies-install-failed'
    );
  });

  it('should attempt install when builder is missing locally and throw MODULE_NOT_FOUND on 2nd pass when install returns empty', async () => {
    const spec = '@vercel/does-not-exist';
    const specs = new Set([spec]);
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');

    vi.mocked(installBuildersModule.installBuilders).mockResolvedValueOnce(
      new Map()
    );
    let err: Error | undefined;
    try {
      await importBuilders(specs, cwd);
    } catch (_err: unknown) {
      err = _err as Error;
    } finally {
      await remove(cwd);
    }

    expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
      buildersDir,
      new Set([spec]),
      undefined
    );
    if (!err) {
      throw new Error('Expected `err` to be defined');
    }
    expect(
      err.message.startsWith(
        'Builder "@vercel/does-not-exist" not found after installation'
      )
    ).toBe(true);
  });

  it('should install and import builder', async () => {
    const spec = 'fake-builder@1.0.0';
    const specs = new Set([spec]);
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const pkgName = 'fake-builder';
    const builderModuleDir = join(buildersDir, 'node_modules', pkgName);

    vi.mocked(installBuildersModule.installBuilders).mockImplementationOnce(
      async (dir, buildersToAdd) => {
        await ensureDir(join(dir, 'node_modules', pkgName));
        await outputJSON(join(dir, 'node_modules', pkgName, 'package.json'), {
          name: pkgName,
          version: '1.0.0',
          main: 'index.js',
        });
        await writeFile(
          join(dir, 'node_modules', pkgName, 'index.js'),
          `exports.version = 3; exports.build = async function() { return { output: {} }; };`
        );
        return new Map([[Array.from(buildersToAdd)[0], pkgName]]);
      }
    );

    try {
      const builders = await importBuilders(specs, cwd);
      expect(builders.size).toBe(1);
      expect(builders.get(spec)?.pkg.name).toBe(pkgName);
      expect(builders.get(spec)?.pkg.version).toBe('1.0.0');
      expect(builders.get(spec)?.pkgPath).toBe(
        join(builderModuleDir, 'package.json')
      );
      expect(builders.get(spec)?.dynamicallyInstalled).toBe(true);
      expect(typeof builders.get(spec)?.builder.build).toBe('function');
    } finally {
      await remove(cwd);
    }
  });

  describe('peer dependency resolution', () => {
    afterEach(() => {
      resetPeerDependenciesCache();
    });

    it('should resolve builder from cwd node_modules when peerDep version matches', async () => {
      // Use realpath to resolve macOS /var -> /private/var symlink
      const cwd = await realpath(await getWriteableDirectory());
      const buildersDir = join(cwd, '.vercel', 'builders');
      const pkgName = 'fake-peer-builder';
      const peerVersion = '2.0.0';

      // Set up a fake builder in cwd's node_modules
      const builderDir = join(cwd, 'node_modules', pkgName);
      await ensureDir(builderDir);
      await outputJSON(join(builderDir, 'package.json'), {
        name: pkgName,
        version: peerVersion,
        main: 'index.js',
      });
      await writeFile(
        join(builderDir, 'index.js'),
        `exports.version = 3; exports.build = async function() { return { output: {} }; };`
      );

      setPeerDependenciesForTesting({ [pkgName]: peerVersion });

      try {
        const result = await resolveBuilders(
          cwd,
          buildersDir,
          new Set([pkgName])
        );
        expect('builders' in result).toBe(true);
        if ('builders' in result) {
          expect(result.builders.size).toBe(1);
          const builder = result.builders.get(pkgName);
          expect(builder?.pkg.name).toBe(pkgName);
          expect(builder?.pkg.version).toBe(peerVersion);
          expect(builder?.pkgPath).toBe(join(builderDir, 'package.json'));
          expect(builder?.dynamicallyInstalled).toBe(false);
        }
      } finally {
        await remove(cwd);
      }
    });

    it('should fall through to CLI bundle when peerDep version does not match cwd', async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');

      // Set up @vercel/node in cwd with a WRONG version
      const builderDir = join(cwd, 'node_modules', '@vercel', 'node');
      await ensureDir(builderDir);
      await outputJSON(join(builderDir, 'package.json'), {
        name: '@vercel/node',
        version: '0.0.1-wrong',
        main: 'index.js',
      });
      await writeFile(
        join(builderDir, 'index.js'),
        `exports.version = 3; exports.build = async function() {};`
      );

      // peerDeps expect a version that doesn't match what's in cwd
      setPeerDependenciesForTesting({ '@vercel/node': '99.99.99' });

      try {
        const result = await resolveBuilders(
          cwd,
          buildersDir,
          new Set(['@vercel/node'])
        );

        // Should still resolve since @vercel/node is in CLI bundle (step 3)
        expect('builders' in result).toBe(true);
        if ('builders' in result) {
          const builder = result.builders.get('@vercel/node');
          expect(builder?.pkg.name).toBe('@vercel/node');
          // Should NOT be the wrong version from cwd
          expect(builder?.pkg.version).not.toBe('0.0.1-wrong');
          // Should come from CLI bundle, not cwd
          expect(builder?.pkgPath).not.toContain(cwd);
        }
      } finally {
        await remove(cwd);
      }
    });

    it('should resolve from CLI bundle when no peerDeps exist (current behavior)', async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');

      setPeerDependenciesForTesting({});

      try {
        const result = await resolveBuilders(
          cwd,
          buildersDir,
          new Set(['@vercel/node'])
        );
        expect('builders' in result).toBe(true);
        if ('builders' in result) {
          const builder = result.builders.get('@vercel/node');
          expect(builder?.pkg.name).toBe('@vercel/node');
          expect(builder?.pkg.version).toBe(vercelNodePkg.version);
        }
      } finally {
        await remove(cwd);
      }
    });

    it('should prefer .vercel/builders cache over CLI bundle when no peerDep specified', async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');
      const pkgName = 'cached-builder';
      const cachedVersion = '3.0.0';

      // Set up builder in .vercel/builders cache
      const cachedBuilderDir = join(buildersDir, 'node_modules', pkgName);
      await ensureDir(cachedBuilderDir);
      await outputJSON(join(cachedBuilderDir, 'package.json'), {
        name: pkgName,
        version: cachedVersion,
        main: 'index.js',
      });
      await writeFile(
        join(cachedBuilderDir, 'index.js'),
        `exports.version = 3; exports.build = async function() { return { output: {} }; };`
      );

      // No peer deps for this builder
      setPeerDependenciesForTesting({});

      try {
        const result = await resolveBuilders(
          cwd,
          buildersDir,
          new Set([pkgName])
        );
        expect('builders' in result).toBe(true);
        if ('builders' in result) {
          const builder = result.builders.get(pkgName);
          expect(builder?.pkg.name).toBe(pkgName);
          expect(builder?.pkg.version).toBe(cachedVersion);
          expect(builder?.pkgPath).toBe(join(cachedBuilderDir, 'package.json'));
          expect(builder?.dynamicallyInstalled).toBe(true);
        }
      } finally {
        await remove(cwd);
      }
    });

    it('should reinstall when .vercel/builders cache version does not match peerDep', async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');
      const pkgName = 'stale-cached-builder';

      // Set up builder in .vercel/builders cache with old version
      const cachedBuilderDir = join(buildersDir, 'node_modules', pkgName);
      await ensureDir(cachedBuilderDir);
      await outputJSON(join(cachedBuilderDir, 'package.json'), {
        name: pkgName,
        version: '1.0.0',
        main: 'index.js',
      });
      await writeFile(
        join(cachedBuilderDir, 'index.js'),
        `exports.version = 3; exports.build = async function() {};`
      );

      // peerDep says we want 2.0.0
      setPeerDependenciesForTesting({ [pkgName]: '2.0.0' });

      try {
        const result = await resolveBuilders(
          cwd,
          buildersDir,
          new Set([pkgName])
        );
        // Should return buildersToAdd since cached version doesn't match peerDep
        expect('buildersToAdd' in result).toBe(true);
        if ('buildersToAdd' in result) {
          expect(result.buildersToAdd.has(`${pkgName}@2.0.0`)).toBe(true);
        }
      } finally {
        await remove(cwd);
      }
    });
  });
});
