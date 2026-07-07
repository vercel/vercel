import { join } from 'path';
import {
  glob,
  FileBlob,
  FileFsRef,
  getWriteableDirectory,
  Lambda,
  type BuilderV2,
  type BuilderV3,
  type ExperimentalServiceV2,
} from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import {
  filesWithoutFsRefs,
  writeBuildResult,
} from '../../../../src/util/build/write-build-result';

describe('writeBuildResult()', () => {
  // Scaffold for V3 scalar-output service builds (ruby service "api").
  // Returns the paths so tests can make their own assertions; callers own
  // cleanup of `workPath`.
  async function writeRubyServiceBuild(
    serviceOverrides: Partial<ExperimentalServiceV2> = {}
  ): Promise<{ workPath: string; outputDir: string; vcConfigPath: string }> {
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const build = {
      src: 'app.rb',
      use: '@vercel/ruby',
      config: { zeroConfig: true },
    };
    const runtimeBuilder: BuilderV3 = {
      version: 3,
      build: async () => {
        throw new Error('not used by writeBuildResult');
      },
    };

    try {
      await writeBuildResult({
        repoRootPath: workPath,
        outputDir,
        buildResult: {
          output: new Lambda({
            files: {
              'app.rb': new FileBlob({
                data: 'run ->(_env) { [200, {}, []] }',
              }),
            },
            handler: 'app.handler',
            runtime: 'ruby3.3',
          }),
        },
        build,
        builder: runtimeBuilder,
        builderPkg: { name: '@vercel/ruby' },
        vercelConfig: null,
        standalone: false,
        workPath,
        service: {
          schema: 'experimentalServicesV2',
          name: 'api',
          root: '.',
          runtime: 'ruby',
          entrypoint: 'app.rb',
          builder: build,
          ...serviceOverrides,
        },
        nestServiceOutput: true,
      });
    } catch (err) {
      await fs.remove(workPath);
      throw err;
    }

    return {
      workPath,
      outputDir,
      vcConfigPath: join(
        outputDir,
        'services/api/functions/index.func/.vc-config.json'
      ),
    };
  }

  it('writes isolated V2 service functions at index', async () => {
    const { workPath, outputDir, vcConfigPath } = await writeRubyServiceBuild();
    try {
      expect(await fs.pathExists(vcConfigPath)).toBe(true);
      expect(
        await fs.pathExists(
          join(
            outputDir,
            'services/api/functions/_svc/api/index.func/.vc-config.json'
          )
        )
      ).toBe(false);
    } finally {
      await fs.remove(workPath);
    }
  });

  it('applies service-level regions to functions without a per-function override', async () => {
    const { workPath, vcConfigPath } = await writeRubyServiceBuild({
      regions: ['sfo1', 'iad1'],
      functionFailoverRegions: ['dub1'],
    });
    try {
      const vcConfig = await fs.readJSON(vcConfigPath);
      expect(vcConfig.regions).toEqual(['sfo1', 'iad1']);
      expect(vcConfig.functionFailoverRegions).toEqual(['dub1']);
    } finally {
      await fs.remove(workPath);
    }
  });

  it('per-function regions override service-level regions', async () => {
    const { workPath, vcConfigPath } = await writeRubyServiceBuild({
      regions: ['sfo1'],
      functionFailoverRegions: ['dub1'],
      functions: {
        'app.rb': {
          regions: ['fra1'],
        },
      },
    });
    try {
      const vcConfig = await fs.readJSON(vcConfigPath);
      // Per-function config wins for `regions`; the service-level failover
      // regions still apply since the function does not override them.
      expect(vcConfig.regions).toEqual(['fra1']);
      expect(vcConfig.functionFailoverRegions).toEqual(['dub1']);
    } finally {
      await fs.remove(workPath);
    }
  });

  // Node/python services produce version-2 build results (e.g. via
  // `@vercel/backends`), which take a different write path than the V3
  // scalar outputs above; service-level regions must survive both.
  it('applies service-level regions to V2 build results', async () => {
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const build = {
      src: 'index.ts',
      use: '@vercel/backends',
      config: { zeroConfig: true },
    };
    const v2Builder: BuilderV2 = {
      version: 2,
      build: async () => {
        throw new Error('not used by writeBuildResult');
      },
    };

    try {
      await writeBuildResult({
        repoRootPath: workPath,
        outputDir,
        buildResult: {
          output: {
            index: new Lambda({
              files: {
                'index.js': new FileBlob({ data: 'module.exports = {};' }),
              },
              handler: 'index.handler',
              runtime: 'nodejs22.x',
            }),
            // A builder-set value (e.g. from per-function config the builder
            // already applied) must win over the service-level default.
            pinned: new Lambda({
              files: {
                'index.js': new FileBlob({ data: 'module.exports = {};' }),
              },
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              regions: ['fra1'],
            }),
          },
        },
        build,
        builder: v2Builder,
        builderPkg: { name: '@vercel/backends' },
        vercelConfig: null,
        standalone: false,
        workPath,
        service: {
          schema: 'experimentalServicesV2',
          name: 'api',
          root: '.',
          runtime: 'node',
          entrypoint: 'index.ts',
          builder: build,
          regions: ['sfo1', 'iad1'],
          functionFailoverRegions: ['dub1'],
        },
        nestServiceOutput: true,
      });

      const inherited = await fs.readJSON(
        join(outputDir, 'services/api/functions/index.func/.vc-config.json')
      );
      expect(inherited.regions).toEqual(['sfo1', 'iad1']);
      expect(inherited.functionFailoverRegions).toEqual(['dub1']);

      const pinned = await fs.readJSON(
        join(outputDir, 'services/api/functions/pinned.func/.vc-config.json')
      );
      expect(pinned.regions).toEqual(['fra1']);
      expect(pinned.functionFailoverRegions).toEqual(['dub1']);
    } finally {
      await fs.remove(workPath);
    }
  });

  // Framework services (e.g. sveltekit via `@vercel/static-build`) emit Build
  // Output API results whose `.vc-config.json` files are authored by the
  // framework adapter and merged verbatim; service-level regions are filled
  // in afterwards.
  it('fills service-level regions into Build Output API functions', async () => {
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const buildOutputPath = join(workPath, 'web', '.vercel', 'output');
    await fs.outputJSON(
      join(buildOutputPath, 'functions/render.func/.vc-config.json'),
      { handler: 'index.js', runtime: 'nodejs22.x' }
    );
    await fs.outputJSON(
      join(buildOutputPath, 'functions/pinned.func/.vc-config.json'),
      { handler: 'index.js', runtime: 'nodejs22.x', regions: ['fra1'] }
    );
    await fs.outputJSON(
      join(buildOutputPath, 'functions/edge.func/.vc-config.json'),
      { runtime: 'edge', entrypoint: 'index.js' }
    );
    const build = {
      src: 'package.json',
      use: '@vercel/static-build',
      config: { zeroConfig: true },
    };
    const v2Builder: BuilderV2 = {
      version: 2,
      build: async () => {
        throw new Error('not used by writeBuildResult');
      },
    };

    try {
      await writeBuildResult({
        repoRootPath: workPath,
        outputDir,
        buildResult: { buildOutputVersion: 3, buildOutputPath },
        build,
        builder: v2Builder,
        builderPkg: { name: '@vercel/static-build' },
        vercelConfig: null,
        standalone: false,
        workPath,
        service: {
          schema: 'experimentalServicesV2',
          name: 'web',
          root: 'web',
          framework: 'sveltekit',
          builder: build,
          regions: ['sfo1'],
          functionFailoverRegions: ['dub1'],
        },
        nestServiceOutput: true,
      });

      const functionsDir = join(outputDir, 'services/web/functions');
      const rendered = await fs.readJSON(
        join(functionsDir, 'render.func/.vc-config.json')
      );
      expect(rendered.regions).toEqual(['sfo1']);
      expect(rendered.functionFailoverRegions).toEqual(['dub1']);

      // Adapter-set regions win; unset failover regions still inherit.
      const pinned = await fs.readJSON(
        join(functionsDir, 'pinned.func/.vc-config.json')
      );
      expect(pinned.regions).toEqual(['fra1']);
      expect(pinned.functionFailoverRegions).toEqual(['dub1']);

      // Edge functions take no Lambda region configuration.
      const edge = await fs.readJSON(
        join(functionsDir, 'edge.func/.vc-config.json')
      );
      expect(edge.regions).toBeUndefined();
      expect(edge.functionFailoverRegions).toBeUndefined();
    } finally {
      await fs.remove(workPath);
    }
  });
});

describe('filesWithoutFsRefs()', () => {
  it('should create `filePathMap` with normalized POSIX paths', async () => {
    const repoRootPath = join(
      __dirname,
      '../../../fixtures/unit/commands/build/monorepo'
    );
    const input = {
      ...(await glob('**', repoRootPath)),
      'blob-file.txt': new FileBlob({ data: 'blob file' }),
    };
    const { files, filePathMap = {} } = await filesWithoutFsRefs(
      input,
      repoRootPath
    );

    // Only the "blob-file.txt" file should be in the `files` object
    expect(Object.keys(files)).toHaveLength(1);
    expect(files['blob-file.txt']).toEqual(input['blob-file.txt']);

    // The `filePathMap` should have normalized POSIX paths, even on Windows
    expect(Object.keys(filePathMap)).not.contain('blob-file.txt');
    expect(filePathMap['apps/nextjs/.gitignore']).toEqual(
      'apps/nextjs/.gitignore'
    );
    expect(filePathMap['apps/nextjs/next.config.js']).toEqual(
      'apps/nextjs/next.config.js'
    );
    expect(filePathMap['apps/nextjs/package.json']).toEqual(
      'apps/nextjs/package.json'
    );
    expect(filePathMap['apps/nextjs/pages/index.jsx']).toEqual(
      'apps/nextjs/pages/index.jsx'
    );
    expect(filePathMap['package-lock.json']).toEqual('package-lock.json');
    expect(filePathMap['package.json']).toEqual('package.json');
  });

  it('keeps the symlink but drops its descendants in standalone mode', async () => {
    if (process.platform === 'win32') {
      return;
    }

    // The build is anchored at the repo root, so the symlink is preserved
    // instead of skipped. Its descendants must NOT also be written, or
    // `download()` can race and create a real directory at the symlink's path
    // (EEXIST -> readlink on a dir -> EINVAL).
    const root = await fs.mkdtemp(join(__dirname, 'resolved-root-symlink-'));
    const pnpmStore = join(
      root,
      'node_modules/.pnpm/next@1.0.0/node_modules/next'
    );
    const appNodeModules = join(root, 'apps/web/node_modules');

    await fs.mkdirp(pnpmStore);
    await fs.writeFile(join(pnpmStore, 'server.js'), 'module.exports = {}');
    await fs.mkdirp(appNodeModules);
    await fs.symlink(
      '../../../node_modules/.pnpm/next@1.0.0/node_modules/next',
      join(appNodeModules, 'next')
    );

    const symlink = await FileFsRef.fromFsPath({
      fsPath: join(appNodeModules, 'next'),
    });
    // A traced descendant reached through the symlink (the failure case).
    const descendant = await FileFsRef.fromFsPath({
      fsPath: join(appNodeModules, 'next/server.js'),
    });
    // The real bytes, anchored in the function (not under the symlink).
    const realFile = await FileFsRef.fromFsPath({
      fsPath: join(pnpmStore, 'server.js'),
    });
    const storeKey =
      'node_modules/.pnpm/next@1.0.0/node_modules/next/server.js';
    // A sibling package whose name shares the symlink's prefix. It must NOT be
    // dropped: `node_modules/next-auth` is not nested under the `next` symlink,
    // which is why the descendant check matches on a trailing slash.
    const siblingFile = await FileFsRef.fromFsPath({ fsPath: __filename });
    const siblingKey = 'apps/web/node_modules/next-auth/index.js';

    const { files } = filesWithoutFsRefs(
      {
        'apps/web/node_modules/next': symlink,
        'apps/web/node_modules/next/server.js': descendant,
        [siblingKey]: siblingFile,
        [storeKey]: realFile,
      },
      root,
      true
    );

    // The symlink itself is kept, its descendant is dropped, and the real
    // file (the symlink's target) is kept.
    expect(files['apps/web/node_modules/next']).toBe(symlink);
    expect(files['apps/web/node_modules/next/server.js']).toBeUndefined();
    expect(files[storeKey]).toBe(realFile);
    // The similarly-named sibling package is unaffected.
    expect(files[siblingKey]).toBe(siblingFile);

    await fs.remove(root);
  });
});
