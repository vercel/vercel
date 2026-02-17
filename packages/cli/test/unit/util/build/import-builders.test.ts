import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { ensureDir, remove, outputJSON, writeFile } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { client } from '../../../mocks/client';
import { importBuilders } from '../../../../src/util/build/import-builders';
import * as installBuildersModule from '../../../../src/util/build/install-builders';
import vercelNextPkg from '@vercel/next/package.json';

vi.mock('../../../../src/util/build/install-builders', async importOriginal => {
  const actual = await (
    importOriginal as () => Promise<typeof installBuildersModule>
  )();
  return {
    ...actual,
    untracedInstallBuilders: vi.fn(
      (...args: Parameters<typeof actual.untracedInstallBuilders>) =>
        actual.untracedInstallBuilders(...args)
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

    vi.mocked(
      installBuildersModule.untracedInstallBuilders
    ).mockResolvedValueOnce(new Map());
    let err: Error | undefined;
    try {
      await importBuilders(specs, cwd);
    } catch (_err: unknown) {
      err = _err as Error;
    } finally {
      await remove(cwd);
    }

    expect(installBuildersModule.untracedInstallBuilders).toHaveBeenCalledWith(
      buildersDir,
      new Set([spec])
    );
    if (!err) {
      throw new Error('Expected `err` to be defined');
    }
    expect(
      err.message.startsWith('Importing "@vercel/does-not-exist": Cannot')
    ).toBe(true);
  });

  it('should install and import builder', async () => {
    const spec = 'fake-builder@1.0.0';
    const specs = new Set([spec]);
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const pkgName = 'fake-builder';
    const builderModuleDir = join(buildersDir, 'node_modules', pkgName);

    vi.mocked(
      installBuildersModule.untracedInstallBuilders
    ).mockImplementationOnce(async (dir, buildersToAdd) => {
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
    });

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
});
