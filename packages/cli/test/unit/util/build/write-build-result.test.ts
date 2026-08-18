import { join } from 'path';
import {
  glob,
  ContainerImage,
  FileBlob,
  FileFsRef,
  getWriteableDirectory,
  Lambda,
  Prerender,
  type BuilderV2,
  type BuilderV3,
} from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import {
  filesWithoutFsRefs,
  writeBuildResult,
} from '../../../../src/util/build/write-build-result';

describe('writeBuildResult()', () => {
  it('writes isolated V2 service functions at index', async () => {
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
        },
        nestServiceOutput: true,
      });

      expect(
        await fs.pathExists(
          join(outputDir, 'services/api/functions/index.func/.vc-config.json')
        )
      ).toBe(true);
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

  it('writes container function configuration to .vc-config.json', async () => {
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const build = {
      src: 'Dockerfile.vercel',
      use: '@vercel/container',
      config: {
        zeroConfig: true,
        functions: {
          'Dockerfile.vercel': {
            memory: 2048,
            maxDuration: 60,
            maxConcurrency: 8,
            regions: ['iad1'],
          },
        },
      },
    };
    const runtimeBuilder: BuilderV2 = {
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
          routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }],
          output: {
            index: new ContainerImage({
              files: {},
              handler: 'docker.io/library/nginx:1.27',
              runtime: 'container',
              environment: {},
              memory: 2048,
              maxDuration: 60,
              maxConcurrency: 8,
              regions: ['iad1'],
            }),
          },
        },
        build,
        builder: runtimeBuilder,
        builderPkg: { name: '@vercel/container' },
        vercelConfig: {
          functions: {
            'Dockerfile.vercel': {
              memory: 2048,
              maxDuration: 60,
              maxConcurrency: 8,
              regions: ['iad1'],
            },
          },
        },
        standalone: false,
        workPath,
      });

      const vcConfig = await fs.readJSON(
        join(outputDir, 'functions/index.func/.vc-config.json')
      );
      expect(vcConfig).toMatchObject({
        handler: 'docker.io/library/nginx:1.27',
        runtime: 'container',
        memory: 2048,
        maxDuration: 60,
        maxConcurrency: 8,
        regions: ['iad1'],
      });
    } finally {
      await fs.remove(workPath);
    }
  });

  it('writes prerenderClassification to .prerender-config.json', async () => {
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const build = {
      src: 'index.js',
      use: '@vercel/node',
      config: { zeroConfig: true },
    };
    const runtimeBuilder: BuilderV2 = {
      version: 2,
      build: async () => {
        throw new Error('not used by writeBuildResult');
      },
    };
    const lambda = new Lambda({
      files: {
        'index.js': new FileBlob({ data: 'module.exports = {}' }),
      },
      handler: 'index.handler',
      runtime: 'nodejs22.x',
    });
    const prerenderClassification = {
      routeType: 'shell',
      response: 'initial',
      compute: 'resuming',
      htmlSize: 5491,
    } as const;

    try {
      await writeBuildResult({
        repoRootPath: workPath,
        outputDir,
        buildResult: {
          output: {
            classified: new Prerender({
              expiration: 1,
              fallback: null,
              lambda,
              bypassToken: 'some-long-bypass-token-to-make-it-work',
              prerenderClassification,
            }),
            // A route Next.js declined to classify (`notFoundRoutes`, Pages
            // Router `fallback: false`) must not gain an empty group.
            unclassified: new Prerender({
              expiration: 1,
              fallback: null,
              lambda,
              bypassToken: 'some-long-bypass-token-to-make-it-work',
            }),
          },
        },
        build,
        builder: runtimeBuilder,
        builderPkg: { name: '@vercel/node' },
        vercelConfig: null,
        standalone: false,
        workPath,
      });

      const classified = await fs.readJSON(
        join(outputDir, 'functions/classified.prerender-config.json')
      );
      expect(classified.prerenderClassification).toEqual(
        prerenderClassification
      );

      const unclassified = await fs.readJSON(
        join(outputDir, 'functions/unclassified.prerender-config.json')
      );
      expect(unclassified).not.toHaveProperty('prerenderClassification');
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
