import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { join } from 'path';
import { ensureDir, remove, outputJSON, writeFile } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { client } from '../../../mocks/client';
import {
  formatResolvedBuilders,
  getBuildersDir,
  importBuilders,
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

vi.mock('../../../../src/util/pkg', async importOriginal => {
  const actual = await (
    importOriginal as () => Promise<{ default: Record<string, unknown> }>
  )();
  return {
    default: {
      ...actual.default,
      builders: {
        ...(actual.default.builders as Record<string, string>),
        'fake-pinned-builder': '2.0.0',
        'fake-url-pinned-builder':
          'https://example.com/tarballs/fake-url-pinned-builder.tgz',
        // pin-builders enforces exact versions, so a range-shaped pin should
        // never exist in a published CLI — but if one slips in, it must not
        // trigger a reinstall on every run.
        'fake-range-pinned-builder': '^2.0.0',
      },
    },
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
      undefined,
      new Map([[spec, 'not-installed']]),
      new Map()
    );
    if (!err) {
      throw new Error('Expected `err` to be defined');
    }
    expect(
      err.message.startsWith('Importing "@vercel/does-not-exist": Cannot')
    ).toBe(true);
  });

  it('should report `entrypoint-load-failed` when a Builder is present but fails to load', async () => {
    const pkgName = 'broken-builder';
    const spec = pkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(buildersDir, 'node_modules', pkgName);

    // A Builder whose `package.json` resolves but whose entrypoint
    // requires a package that is not installed
    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: pkgName,
      version: '1.0.0',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `require('some-package-that-does-not-exist');`
    );

    vi.mocked(installBuildersModule.installBuilders).mockImplementationOnce(
      async () => {
        // Reinstalling repairs the broken entrypoint
        await writeFile(
          join(builderModuleDir, 'index.js'),
          `exports.version = 3; exports.build = async function() { return { output: {} }; };`
        );
        return new Map();
      }
    );

    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set([spec]),
        undefined,
        new Map([
          [spec, 'entrypoint-load-failed:some-package-that-does-not-exist'],
        ]),
        new Map()
      );
      expect(builders.get(spec)?.pkg.version).toBe('1.0.0');
      expect(builders.get(spec)?.dynamicallyInstalled).toBe(true);
    } finally {
      await remove(cwd);
    }
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

  const pkgName = 'fake-pinned-builder';
  const urlPinnedPkgName = 'fake-url-pinned-builder';
  const urlPinnedTarball =
    'https://example.com/tarballs/fake-url-pinned-builder.tgz';

  function mockInstallWritingVersion(version: string, name: string = pkgName) {
    vi.mocked(installBuildersModule.installBuilders).mockImplementationOnce(
      async (dir, buildersToAdd) => {
        const installedSpec = Array.from(buildersToAdd)[0];
        await outputJSON(join(dir, 'package.json'), {
          dependencies: { [name]: installedSpec },
        });
        await outputJSON(join(dir, 'node_modules', name, 'package.json'), {
          name,
          version,
          main: 'index.js',
        });
        await writeFile(
          join(dir, 'node_modules', name, 'index.js'),
          `exports.version = 3; exports.build = async function() { return { output: {} }; };`
        );
        return new Map();
      }
    );
  }

  it('should install the peer-declared version for bare specs', async () => {
    const spec = pkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');

    mockInstallWritingVersion('2.0.0');
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set(['fake-pinned-builder@2.0.0']),
        undefined,
        new Map([[spec, 'not-installed']]),
        new Map([[spec, 'fake-pinned-builder@2.0.0']])
      );
      expect(builders.get(spec)?.pkg.version).toBe('2.0.0');
    } finally {
      await remove(cwd);
    }
  });

  it('should install the tarball URL pin for bare specs', async () => {
    const spec = urlPinnedPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');

    mockInstallWritingVersion('9.9.9-preview', urlPinnedPkgName);
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set([urlPinnedTarball]),
        undefined,
        new Map([[spec, 'not-installed']]),
        new Map([[spec, urlPinnedTarball]])
      );
      expect(builders.get(spec)?.pkg.version).toBe('9.9.9-preview');
    } finally {
      await remove(cwd);
    }
  });

  it('should not reinstall a resolved builder when the pin is a tarball URL', async () => {
    // URL pins cannot equal package.json#version; they are install targets only.
    const spec = urlPinnedPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(
      buildersDir,
      'node_modules',
      urlPinnedPkgName
    );

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: urlPinnedPkgName,
      version: '9.9.9-preview',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `exports.version = 3; exports.build = async function() { return { output: {} }; };`
    );
    await outputJSON(join(buildersDir, 'package.json'), {
      dependencies: { [urlPinnedPkgName]: urlPinnedTarball },
    });

    vi.mocked(installBuildersModule.installBuilders).mockClear();
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).not.toHaveBeenCalled();
      expect(builders.get(spec)?.pkg.version).toBe('9.9.9-preview');
    } finally {
      await remove(cwd);
    }
  });

  it('should install the explicit pin when it differs from the peer-declared version', async () => {
    const spec = 'fake-pinned-builder@1.0.0';
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');

    mockInstallWritingVersion('1.0.0');
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set(['fake-pinned-builder@1.0.0']),
        undefined,
        new Map([[spec, 'not-installed']]),
        new Map()
      );
      expect(builders.get(spec)?.pkg.version).toBe('1.0.0');
    } finally {
      await remove(cwd);
    }
  });

  it('should reinstall a cached bare-spec Builder that no longer matches the pinned version', async () => {
    const spec = pkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(buildersDir, 'node_modules', pkgName);

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: pkgName,
      version: '1.5.0',
      main: 'index.js',
    });

    mockInstallWritingVersion('2.0.0');
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set(['fake-pinned-builder@2.0.0']),
        undefined,
        new Map([[spec, 'pin-version-mismatch']]),
        new Map([[spec, 'fake-pinned-builder@2.0.0']])
      );
      expect(builders.get(spec)?.pkg.version).toBe('2.0.0');
    } finally {
      await remove(cwd);
    }
  });

  it('should reinstall when a bare-spec Builder matches a pin range but not the exact pin', async () => {
    // Pins are exact published versions; a cached 2.0.1 must not satisfy pin 2.0.0
    // via semver satisfies — only exact equality counts.
    const spec = pkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(buildersDir, 'node_modules', pkgName);

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: pkgName,
      version: '2.0.1',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `exports.version = 3; exports.build = async function() { return { output: {} }; };`
    );

    mockInstallWritingVersion('2.0.0');
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set(['fake-pinned-builder@2.0.0']),
        undefined,
        new Map([[spec, 'pin-version-mismatch']]),
        new Map([[spec, 'fake-pinned-builder@2.0.0']])
      );
      expect(builders.get(spec)?.pkg.version).toBe('2.0.0');
    } finally {
      await remove(cwd);
    }
  });

  it('should reinstall a URL-pinned builder installed from npm', async () => {
    const spec = urlPinnedPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(
      buildersDir,
      'node_modules',
      urlPinnedPkgName
    );

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: urlPinnedPkgName,
      version: '9.9.9',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `exports.version = 3; exports.build = async function() { return { output: {} }; };`
    );
    await outputJSON(join(buildersDir, 'package.json'), {
      dependencies: { [urlPinnedPkgName]: '^9.9.9' },
    });

    mockInstallWritingVersion('9.9.9-cafebabe', urlPinnedPkgName);
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set([urlPinnedTarball]),
        undefined,
        new Map([[spec, 'preview-pack-mismatch']]),
        new Map([[spec, urlPinnedTarball]])
      );
      expect(builders.get(spec)?.pkg.version).toBe('9.9.9-cafebabe');
    } finally {
      await remove(cwd);
    }
  });

  it('should keep a URL-pinned builder installed from the same URL', async () => {
    const spec = urlPinnedPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(
      buildersDir,
      'node_modules',
      urlPinnedPkgName
    );

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: urlPinnedPkgName,
      version: '9.9.9-cafebabe',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `exports.version = 3; exports.build = async function() { return { output: {} }; };`
    );
    await outputJSON(join(buildersDir, 'package.json'), {
      dependencies: { [urlPinnedPkgName]: urlPinnedTarball },
    });

    vi.mocked(installBuildersModule.installBuilders).mockClear();
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).not.toHaveBeenCalled();
      expect(builders.get(spec)?.pkg.version).toBe('9.9.9-cafebabe');
    } finally {
      await remove(cwd);
    }
  });

  it('should not reinstall a resolved builder when the pin is range-shaped', async () => {
    // pin-builders enforces exact versions at pack time, but a range-shaped
    // pin must not force `pin-version-mismatch` reinstalls on every run
    // (equality against a range string would never hold).
    const rangePinnedPkgName = 'fake-range-pinned-builder';
    const spec = rangePinnedPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(
      buildersDir,
      'node_modules',
      rangePinnedPkgName
    );

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: rangePinnedPkgName,
      version: '2.5.0',
      main: 'index.js',
    });
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `exports.version = 3; exports.build = async function() { return { output: {} }; };`
    );

    vi.mocked(installBuildersModule.installBuilders).mockClear();
    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).not.toHaveBeenCalled();
      expect(builders.get(spec)?.pkg.version).toBe('2.5.0');
    } finally {
      await remove(cwd);
    }
  });

  it('should fall back to install when the entrypoint load throws ENOENT', async () => {
    // Native SEA builds can surface ENOENT (instead of MODULE_NOT_FOUND) when
    // a builder's entrypoint reads a ghost path from the SEA VFS. The first
    // resolve pass must treat that like a missing module and install.
    const enoentPkgName = 'fake-enoent-builder';
    const spec = enoentPkgName;
    const cwd = await getWriteableDirectory();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const builderModuleDir = join(buildersDir, 'node_modules', enoentPkgName);

    await outputJSON(join(builderModuleDir, 'package.json'), {
      name: enoentPkgName,
      version: '1.0.0',
      main: 'index.js',
    });
    // Simulates an eager `readFileSync` in the builder's top-level code
    // failing with ENOENT (e.g. a path that exists only outside the SEA VFS).
    await writeFile(
      join(builderModuleDir, 'index.js'),
      `const err = new Error("ENOENT: no such file or directory, open '/snapshot/ghost'");
       err.code = 'ENOENT';
       throw err;`
    );

    vi.mocked(installBuildersModule.installBuilders).mockImplementationOnce(
      async () => {
        // Reinstalling repairs the broken entrypoint
        await writeFile(
          join(builderModuleDir, 'index.js'),
          `exports.version = 3; exports.build = async function() { return { output: {} }; };`
        );
        return new Map();
      }
    );

    try {
      const builders = await importBuilders(new Set([spec]), cwd);
      expect(installBuildersModule.installBuilders).toHaveBeenCalledWith(
        buildersDir,
        new Set([spec]),
        undefined,
        new Map([[spec, 'entrypoint-load-failed']]),
        new Map()
      );
      expect(builders.get(spec)?.pkg.version).toBe('1.0.0');
      expect(builders.get(spec)?.dynamicallyInstalled).toBe(true);
    } finally {
      await remove(cwd);
    }
  });

  it('should throw a descriptive error when the installed version still does not resolve', async () => {
    const spec = 'fake-pinned-builder@3.0.0';
    const cwd = await getWriteableDirectory();

    // Install "succeeds" but yields a different version than the pin
    mockInstallWritingVersion('2.0.0');
    let err: Error | undefined;
    try {
      await importBuilders(new Set([spec]), cwd);
    } catch (_err: unknown) {
      err = _err as Error;
    } finally {
      await remove(cwd);
    }

    if (!err) {
      throw new Error('Expected `err` to be defined');
    }
    expect(err.message).toContain(
      'Failed to load Builders after installing them: fake-pinned-builder@3.0.0 (version-mismatch)'
    );
    expect((err as any).link).toEqual(
      'https://vercel.link/builder-dependencies-install-failed'
    );
  });

  it('should format resolved Builders with their source directory', async () => {
    const specs = new Set(['@vercel/node', '@vercel/static']);
    const builders = await importBuilders(specs, process.cwd());
    const resolved = formatResolvedBuilders(builders);
    expect(resolved).toContain(
      `@vercel/node@${vercelNodePkg.version}=${join(repoRoot, 'packages/node')}`
    );
    expect(resolved).toContain('@vercel/static=built-in');
  });

  describe('getBuildersDir()', () => {
    // A genuinely absolute path on every platform (drive-letter'd on
    // Windows, where a bare `/some/project` is not absolute).
    const projectCwd = join(process.cwd(), 'some-project');

    afterEach(() => {
      delete process.env.VERCEL_BUILDERS_DIR;
    });

    it('should default to `.vercel/builders` within the project', () => {
      expect(getBuildersDir(projectCwd)).toEqual(
        join(projectCwd, '.vercel', 'builders')
      );
    });

    it('should use an absolute `VERCEL_BUILDERS_DIR` as-is', () => {
      const absoluteDir = join(process.cwd(), 'builders-cache');
      process.env.VERCEL_BUILDERS_DIR = absoluteDir;
      expect(getBuildersDir(projectCwd)).toEqual(absoluteDir);
    });

    it('should resolve a relative `VERCEL_BUILDERS_DIR` against cwd', () => {
      process.env.VERCEL_BUILDERS_DIR = 'my-builders';
      expect(getBuildersDir(projectCwd)).toEqual(
        join(projectCwd, 'my-builders')
      );
    });
  });

  describe('native binary resolution', () => {
    beforeEach(() => {
      vi.mocked(installBuildersModule.installBuilders).mockClear();
    });

    afterEach(() => {
      delete process.env.VERCEL_VC_NATIVE;
      delete process.env.VERCEL_BUILDERS_DIR;
    });

    it('should not fall back to CLI dependencies in the native binary', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');

      // `@vercel/node` resolves as a CLI dependency in the monorepo, but the
      // native binary must only look in the Builders directory and install
      // when missing.
      mockInstallWritingVersion('9.9.9', '@vercel/node');
      try {
        const builders = await importBuilders(new Set(['@vercel/node']), cwd);
        expect(installBuildersModule.installBuilders).toHaveBeenCalledTimes(1);
        expect(builders.get('@vercel/node')?.pkgPath).toEqual(
          join(buildersDir, 'node_modules', '@vercel/node', 'package.json')
        );
        expect(builders.get('@vercel/node')?.dynamicallyInstalled).toBe(true);
      } finally {
        await remove(cwd);
      }
    });

    it('should resolve from `VERCEL_BUILDERS_DIR` when set', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, 'custom-builders-cache');
      process.env.VERCEL_BUILDERS_DIR = buildersDir;

      const builderModuleDir = join(
        buildersDir,
        'node_modules',
        'fake-cached-builder'
      );
      await outputJSON(join(builderModuleDir, 'package.json'), {
        name: 'fake-cached-builder',
        version: '1.0.0',
        main: 'index.js',
      });
      await writeFile(
        join(builderModuleDir, 'index.js'),
        `exports.version = 3; exports.build = async function() { return { output: {} }; };`
      );

      try {
        const builders = await importBuilders(
          new Set(['fake-cached-builder']),
          cwd
        );
        expect(installBuildersModule.installBuilders).not.toHaveBeenCalled();
        expect(builders.get('fake-cached-builder')?.pkgPath).toEqual(
          join(builderModuleDir, 'package.json')
        );
      } finally {
        await remove(cwd);
      }
    });
  });
});
