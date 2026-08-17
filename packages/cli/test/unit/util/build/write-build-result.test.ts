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

describe('writeBuildResult() static symlink boundary', () => {
  // Regression coverage for the `fs.link()` fast-path in `writeStaticFile()`.
  // That fast-path used to run for every `File` carrying an `fsPath`, which
  // meant a symlink was hard-linked straight into `.vercel/output/static`
  // without ever reaching the `basePath` boundary check inside
  // `downloadFile()`. Symlinks now skip the fast-path so the check applies.

  /** Build a V2 static-only build result for a single output file. */
  async function writeStatic(
    workPath: string,
    outputDir: string,
    outputPath: string,
    file: FileFsRef
  ) {
    const build = { src: 'index.html', use: '@vercel/static' };
    const staticBuilder: BuilderV2 = {
      version: 2,
      build: async () => {
        throw new Error('not used by writeBuildResult');
      },
    };
    return writeBuildResult({
      repoRootPath: workPath,
      outputDir,
      buildResult: { output: { [outputPath]: file } },
      build,
      builder: staticBuilder,
      builderPkg: { name: '@vercel/static' },
      vercelConfig: null,
      standalone: false,
      workPath,
    });
  }

  /** Create a symlink on disk and wrap it in a `FileFsRef` the way `glob()` does. */
  async function symlinkRef(fsPath: string, target: string) {
    await fs.mkdirp(join(fsPath, '..'));
    await fs.symlink(target, fsPath);
    // `glob()` uses `lstat`, so the mode carries the symlink type bits.
    const stat = await fs.lstat(fsPath);
    return new FileFsRef({ mode: stat.mode, fsPath });
  }

  it('rejects a relative symlink that escapes the build root', async () => {
    if (process.platform === 'win32') return;
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    // The secret sits outside `.vercel/output/static`, which is the build root
    // enforced by `downloadFile()`.
    await fs.writeFile(join(workPath, 'secret.txt'), 'SECRET');
    // The source symlink is nested one level deeper so that `../../secret.txt`
    // resolves to a real file *from the source location*. That matters: a
    // dangling symlink would make `fs.link()` fail with ENOENT and fall
    // through to the guard on its own, so this test would still pass with the
    // fast-path bug present and would not be a regression test at all.
    const file = await symlinkRef(
      join(workPath, 'dist', 'nested', 'leak.txt'),
      '../../secret.txt'
    );
    expect(await fs.readFile(file.fsPath, 'utf8')).toBe('SECRET');

    await expect(
      writeStatic(workPath, outputDir, 'leak.txt', file)
    ).rejects.toThrow(/resolves outside of the build root/);

    // Nothing may be materialized at the destination — in particular the
    // `fs.link()` fast-path must not have copied the entry in first.
    expect(
      await fs.pathExists(join(outputDir, 'static', 'leak.txt'))
    ).toBe(false);

    await fs.remove(workPath);
  });

  it('rejects an absolute symlink that escapes the build root', async () => {
    if (process.platform === 'win32') return;
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const file = await symlinkRef(join(workPath, 'dist', 'passwd'), '/etc/passwd');

    await expect(
      writeStatic(workPath, outputDir, 'passwd', file)
    ).rejects.toThrow(/resolves outside of the build root/);

    expect(await fs.pathExists(join(outputDir, 'static', 'passwd'))).toBe(false);

    await fs.remove(workPath);
  });

  it('still writes a symlink whose target stays inside the build root', async () => {
    if (process.platform === 'win32') return;
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    // Monorepo hoisting legitimately uses `../` links that resolve back
    // inside the output directory (see #16439) — those must keep working.
    await fs.mkdirp(join(outputDir, 'static'));
    await fs.writeFile(join(outputDir, 'static', 'real.txt'), 'in-root');
    const file = await symlinkRef(join(workPath, 'dist', 'link.txt'), '../real.txt');

    await writeStatic(workPath, outputDir, 'sub/link.txt', file);

    const dest = join(outputDir, 'static', 'sub', 'link.txt');
    expect((await fs.lstat(dest)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(dest)).toBe('../real.txt');
    expect(await fs.readFile(dest, 'utf8')).toBe('in-root');

    await fs.remove(workPath);
  });

  it('keeps the hard-link fast-path for regular files', async () => {
    if (process.platform === 'win32') return;
    const workPath = await getWriteableDirectory();
    const outputDir = join(workPath, '.vercel', 'output');
    const src = join(workPath, 'dist', 'index.html');
    await fs.mkdirp(join(workPath, 'dist'));
    await fs.writeFile(src, '<h1>hello</h1>');
    const file = new FileFsRef({ mode: (await fs.lstat(src)).mode, fsPath: src });

    await writeStatic(workPath, outputDir, 'index.html', file);

    const dest = join(outputDir, 'static', 'index.html');
    expect(await fs.readFile(dest, 'utf8')).toBe('<h1>hello</h1>');
    // A hard link shares the inode with the source; this asserts the
    // optimization was not lost when symlinks were carved out of it.
    expect((await fs.stat(dest)).ino).toBe((await fs.stat(src)).ino);

    await fs.remove(workPath);
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
