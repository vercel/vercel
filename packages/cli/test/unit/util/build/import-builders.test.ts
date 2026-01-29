import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { remove } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { client } from '../../../mocks/client';
import {
  importBuilders,
  resolveBuilders,
} from '../../../../src/util/build/import-builders';
import vercelNextPkg from '@vercel/next/package.json';
import vercelNodePkg from '@vercel/node/package.json';
import { vi } from 'vitest';
import { isWindows } from '../../../helpers/is-windows';

// these tests can take upwards of 190s on macos-latest
vi.setConfig({ testTimeout: 4 * 60 * 1000 });

describe('importBuilders()', () => {
  it('should import built-in Builders', async () => {
    const specs = new Set(['@vercel/node', '@vercel/next']);
    const builders = await importBuilders(specs, process.cwd());
    expect(builders.size).toEqual(2);
    // Check package name matches (version may differ between local workspace and npm)
    expect(builders.get('@vercel/node')?.pkg.name).toEqual(vercelNodePkg.name);
    expect(builders.get('@vercel/next')?.pkg.name).toEqual(vercelNextPkg.name);
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
    // Check package name matches (version may differ between local workspace and npm)
    expect(builders.get('@vercel/node@latest')?.pkg.name).toEqual(
      vercelNodePkg.name
    );
    expect(builders.get('@vercel/next@latest')?.pkg.name).toEqual(
      vercelNextPkg.name
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
    // Check package name matches (version may differ between local workspace and npm)
    expect(builders.get('@vercel/node@canary')?.pkg.name).toEqual(
      vercelNodePkg.name
    );
    expect(builders.get('@vercel/next@canary')?.pkg.name).toEqual(
      vercelNextPkg.name
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
});

describe('resolveBuilders()', () => {
  it('should return builders to install when missing', async () => {
    const cwd = process.cwd();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const specs = new Set(['@vercel/does-not-exist']);
    const result = await resolveBuilders(cwd, buildersDir, specs);
    if (!('buildersToAdd' in result)) {
      throw new Error('Expected `buildersToAdd` to be defined');
    }
    expect([...result.buildersToAdd]).toEqual(['@vercel/does-not-exist']);
  });

  it('should throw error when `MODULE_NOT_FOUND` on 2nd pass', async () => {
    let err: Error | undefined;
    const cwd = process.cwd();
    const buildersDir = join(cwd, '.vercel', 'builders');
    const specs = new Set(['@vercel/does-not-exist']);

    // The empty Map represents `resolveBuilders()` being invoked after the install step
    try {
      await resolveBuilders(cwd, buildersDir, specs, new Map());
    } catch (_err: unknown) {
      err = _err as Error;
    }

    if (!err) {
      throw new Error('Expected `err` to be defined');
    }

    expect(err.message).toEqual('Builder "@vercel/does-not-exist" not found');
  });

  // Tests for peerDependencies version resolution
  // Note: In the monorepo, peerDep builders are installed via workspace, so we can't
  // easily test "builder not found" scenarios for them. We test the following:
  // 1. Non-peerDep builders keep original spec (no version appended)
  // 2. Explicit versions are preserved
  // 3. The actual peerDep resolution is tested via importBuilders which exercises the full flow

  it.skipIf(isWindows)(
    'should keep original spec for builders NOT in peerDeps',
    async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');
      try {
        // 'some-random-builder' is not in the CLI's peerDependencies
        const specs = new Set(['some-random-builder']);
        const result = await resolveBuilders(cwd, buildersDir, specs);

        if (!('buildersToAdd' in result)) {
          throw new Error('Expected `buildersToAdd` to be defined');
        }

        // Should keep the original spec without appending a version
        const buildersToAdd = [...result.buildersToAdd];
        expect(buildersToAdd).toEqual(['some-random-builder']);
      } finally {
        await remove(cwd);
      }
    }
  );

  it.skipIf(isWindows)(
    'should preserve explicit version even for peerDep builders',
    async () => {
      const cwd = await getWriteableDirectory();
      const buildersDir = join(cwd, '.vercel', 'builders');
      try {
        // Even though @vercel/node is in peerDeps, explicit version should be preserved
        const specs = new Set(['@vercel/node@2.0.0']);
        const result = await resolveBuilders(cwd, buildersDir, specs);

        if (!('buildersToAdd' in result)) {
          throw new Error('Expected `buildersToAdd` to be defined');
        }

        // Should keep the explicit version, not replace with peerDep version
        const buildersToAdd = [...result.buildersToAdd];
        expect(buildersToAdd).toEqual(['@vercel/node@2.0.0']);
      } finally {
        await remove(cwd);
      }
    }
  );
});
