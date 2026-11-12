import { join, resolve } from 'path';
import fs from 'fs-extra';
import {
  buildFileTree,
  prepareFiles,
  shouldInlineStaticFiles,
} from '../src/utils';
import type { FilesMap } from '../src/utils/hashes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const fixture = (name: string) => resolve(__dirname, 'fixtures', name);
const noop = () => {};

const normalizeWindowsPaths = (files: string[]) => {
  if (process.platform === 'win32') {
    return files.map(f => f.replace(/\\/g, '/'));
  }
  return files;
};

const toAbsolutePaths = (cwd: string, files: string[]) =>
  files.map(p => join(cwd, p));

const defaultVcConfigPath = (cwd: string) =>
  join(cwd, '.vercel/output/functions/api/example.func/.vc-config.json');

/** Rewrite the gitignored fixture `.vc-config.json` for the duration of `run`. */
async function withDefaultFilePathMap(
  cwd: string,
  filePathMap: Record<string, string>,
  run: () => Promise<void>
) {
  const configPath = defaultVcConfigPath(cwd);
  const original = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(original);
  await fs.writeJson(configPath, { ...parsed, filePathMap });
  try {
    await run();
  } finally {
    await fs.writeFile(configPath, original);
  }
}

describe('instant static file preparation', () => {
  const createFiles = (mode: number): FilesMap => {
    const data = Buffer.from('<html></html>');
    return new Map([
      [
        'abc123',
        {
          names: ['/project/index.html'],
          data,
          mode,
          size: data.byteLength,
        },
      ],
    ]);
  };

  it('inlines regular static files and preserves their mode', () => {
    const files = createFiles(0o100644);

    expect(shouldInlineStaticFiles(files)).toBe(true);
    expect(
      prepareFiles(files, { isDirectory: true, path: '/project' })
    ).toEqual([
      {
        file: 'index.html',
        data: Buffer.from('<html></html>').toString('base64'),
        encoding: 'base64',
        mode: 0o100644,
      },
    ]);
  });

  it('keeps symlinks on the SHA upload path', () => {
    const files = createFiles(0o120777);

    expect(shouldInlineStaticFiles(files)).toBe(false);
    expect(
      prepareFiles(files, { isDirectory: true, path: '/project' })
    ).toEqual([
      {
        file: 'index.html',
        sha: 'abc123',
        size: Buffer.byteLength('<html></html>'),
        mode: 0o120777,
      },
    ]);
  });
});

describe('buildFileTree()', () => {
  it('should exclude files using `.nowignore` blocklist', async () => {
    const cwd = fixture('nowignore');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      '.nowignore',
      'folder',
      'index.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = [
      'ignore.txt',
      'folder/ignore.txt',
      'node_modules',
    ];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should include symlinked files and directories', async () => {
    const cwd = fixture('symlinks');

    // Also add an empty directory to make sure it's included
    await fs.mkdirp(join(cwd, 'empty'));

    const { fileList } = await buildFileTree(cwd, { isDirectory: true }, noop);

    const expectedFileList = toAbsolutePaths(cwd, [
      'empty',
      'folder-link',
      'folder/text.txt',
      'index.txt',
      'index-link.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );
  });

  it('should include the node_modules using `.vercelignore` allowlist', async () => {
    const cwd = fixture('vercelignore-allow-nodemodules');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true },
      noop
    );

    const expected = toAbsolutePaths(cwd, [
      'node_modules/one.txt',
      'sub/node_modules/two.txt',
      'sub/include.txt',
      '.vercelignore',
      'hello.txt',
    ]);
    expect(normalizeWindowsPaths(expected).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.env.local', 'exclude.txt'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should find root files but ignore `.vercel/output` files when prebuilt=false', async () => {
    const cwd = fixture('file-system-api');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true, prebuilt: false },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, ['foo.txt', 'sub/bar.txt']);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.gitignore', '.vercel'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should find `.vercel/output` files but ignore other files when prebuilt=true', async () => {
    const cwd = fixture('file-system-api');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, '.vercel/output'),
      },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      '.vercel/output/functions/api/another.func/.vc-config.json',
      '.vercel/output/functions/api/example.func/.vc-config.json',
      '.vercel/output/static/baz.txt',
      '.vercel/output/static/sub/qux.txt',
      'node_modules/another/index.js',
      'node_modules/example/index.js',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['.gitignore', 'foo.txt', 'sub'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('should include non-ignored `filePathMap` entries when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    await withDefaultFilePathMap(
      cwd,
      {
        'index.js': 'safe-handler.js',
        'escaped.txt': '../outside.txt',
      },
      async () => {
        const { fileList } = await buildFileTree(
          cwd,
          {
            isDirectory: true,
            prebuilt: true,
            vercelOutputDir: join(cwd, '.vercel/output'),
          },
          noop
        );

        const normalized = normalizeWindowsPaths(fileList);
        const included = (rel: string) =>
          normalizeWindowsPaths([join(cwd, rel)])[0];

        // `safe-handler.js` is not ignored and must still be included
        expect(normalized).toContain(included('safe-handler.js'));
        expect(normalized).toContain(
          included('.vercel/output/functions/api/example.func/.vc-config.json')
        );

        // `.env` is excluded by `.vercelignore` and is not in this
        // `filePathMap`, so it must not appear in the upload set
        expect(normalized).not.toContain(included('.env'));
      }
    );
  });

  it('should warn with violations when `filePathMap` entries match `.vercelignore` rules when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/ignored-collision.func'
    );
    const extraConfigPath = join(extraFuncDir, '.vc-config.json');
    await fs.ensureDir(extraFuncDir);
    await fs.writeJson(extraConfigPath, {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap: {
        'route.js': 'src/app/api/webhooks/supabase/route.ts',
        'readme.md': 'README.md',
        'wrangler.toml': 'wrangler.toml',
        'leaked.env': '.env',
      },
    });

    try {
      const { fileList, warning } = await buildFileTree(
        cwd,
        {
          isDirectory: true,
          prebuilt: true,
          vercelOutputDir: join(cwd, '.vercel/output'),
        },
        noop
      );

      expect(warning).toContain(
        '`.vercelignore` excludes 4 files the prebuilt functions need'
      );
      expect(warning).toContain('Uploading without them may fail with ENOENT.');
      expect(warning).toContain(
        'README.md (matched `.vercelignore:11`: `*.md`)'
      );
      expect(warning).toContain(
        'src/app/api/webhooks/supabase/route.ts (matched `.vercelignore:10`: `supabase/`)'
      );
      expect(warning).toContain(
        'wrangler.toml (matched `.vercelignore:12`: `wrangler.toml`)'
      );
      expect(warning).toContain('.env (matched `.vercelignore:1`: `.env*`)');
      expect(warning).toContain('outputFileTracingExcludes');
      expect(warning).not.toContain('safe-handler.js');

      const normalized = normalizeWindowsPaths(fileList);
      const included = (rel: string) =>
        normalizeWindowsPaths([join(cwd, rel)])[0];
      expect(normalized).not.toContain(included('README.md'));
      expect(normalized).not.toContain(
        included('src/app/api/webhooks/supabase/route.ts')
      );
      expect(normalized).not.toContain(included('wrangler.toml'));
      expect(normalized).not.toContain(included('.env'));
    } finally {
      await fs.remove(extraFuncDir);
    }
  });

  it('should report the effective rule after negation', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const vercelIgnorePath = join(cwd, '.vercelignore');
    const original = await fs.readFile(vercelIgnorePath, 'utf8');
    await fs.writeFile(vercelIgnorePath, '*.md\n!README.md\nREADME.md\n');

    try {
      await withDefaultFilePathMap(
        cwd,
        { 'readme.md': 'README.md' },
        async () => {
          const { warning } = await buildFileTree(
            cwd,
            {
              isDirectory: true,
              prebuilt: true,
              vercelOutputDir: join(cwd, '.vercel/output'),
            },
            noop
          );

          expect(warning).toContain(
            'README.md (matched `.vercelignore:3`: `README.md`)'
          );
          expect(warning).not.toContain('`.vercelignore:1`');
        }
      );
    } finally {
      await fs.writeFile(vercelIgnorePath, original);
    }
  });

  it('should support deprecated `.nowignore` rules for prebuilt `filePathMap` collisions', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const vercelIgnorePath = join(cwd, '.vercelignore');
    const nowIgnorePath = join(cwd, '.nowignore');
    await fs.rename(vercelIgnorePath, nowIgnorePath);

    try {
      const { warning } = await buildFileTree(
        cwd,
        {
          isDirectory: true,
          prebuilt: true,
          vercelOutputDir: join(cwd, '.vercel/output'),
        },
        noop
      );

      expect(warning).toContain('`.nowignore` (deprecated) excludes 1 file');
      expect(warning).toContain('.env (matched `.nowignore:1`: `.env*`)');
      expect(warning).toContain('Remove the colliding rules from `.nowignore`');
    } finally {
      await fs.rename(nowIgnorePath, vercelIgnorePath);
    }
  });

  it('should cap the warning after 100 ignored `filePathMap` collisions when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/many-collisions.func'
    );
    const extraConfigPath = join(extraFuncDir, '.vc-config.json');
    const filePathMap = Object.fromEntries(
      Array.from({ length: 125 }, (_, i) => {
        const rel = `ignored-${String(i).padStart(3, '0')}.md`;
        return [rel, rel];
      })
    );
    await fs.ensureDir(extraFuncDir);
    await fs.writeJson(extraConfigPath, {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap,
    });

    try {
      await withDefaultFilePathMap(
        cwd,
        {
          'index.js': 'safe-handler.js',
        },
        async () => {
          const { fileList, warning } = await buildFileTree(
            cwd,
            {
              isDirectory: true,
              prebuilt: true,
              vercelOutputDir: join(cwd, '.vercel/output'),
            },
            noop
          );

          expect(warning).toContain(
            '`.vercelignore` excludes at least 100 files the prebuilt functions need'
          );
          expect(warning).toContain('ignored-000.md');
          expect(warning).toContain('ignored-099.md');
          expect(warning).toContain('…and more');
          expect(warning).not.toContain('ignored-100.md');
          expect(warning).not.toContain('ignored-124.md');

          const normalized = normalizeWindowsPaths(fileList);
          expect(normalized).toContain(
            normalizeWindowsPaths([join(cwd, 'safe-handler.js')])[0]
          );
        }
      );
    } finally {
      await fs.remove(extraFuncDir);
    }
  });

  it('should succeed when ignored paths are omitted from `filePathMap` (outputFileTracingExcludes)', async () => {
    // Next.js `outputFileTracingExcludes` keeps colliding paths out of
    // `filePathMap` before `--prebuilt` runs. The `.vercelignore` rules
    // (`*.md`, `supabase/`, `wrangler.toml`) remain, but because those
    // files are not in the trace, upload must succeed.
    const cwd = fixture('prebuilt-filepathmap-ignore');
    expect(await fs.pathExists(join(cwd, 'README.md'))).toBe(true);
    expect(
      await fs.pathExists(join(cwd, 'src/app/api/webhooks/supabase/route.ts'))
    ).toBe(true);
    expect(await fs.pathExists(join(cwd, 'wrangler.toml'))).toBe(true);

    await withDefaultFilePathMap(
      cwd,
      {
        'index.js': 'safe-handler.js',
      },
      async () => {
        const { fileList } = await buildFileTree(
          cwd,
          {
            isDirectory: true,
            prebuilt: true,
            vercelOutputDir: join(cwd, '.vercel/output'),
          },
          noop
        );

        const normalized = normalizeWindowsPaths(fileList);
        const included = (rel: string) =>
          normalizeWindowsPaths([join(cwd, rel)])[0];

        expect(normalized).toContain(included('safe-handler.js'));
        expect(normalized).not.toContain(included('README.md'));
        expect(normalized).not.toContain(
          included('src/app/api/webhooks/supabase/route.ts')
        );
        expect(normalized).not.toContain(included('wrangler.toml'));
      }
    );
  });

  it('should keep `filePathMap` entries under default-ignored dependency dirs when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/collision.func'
    );
    const extraConfigPath = join(extraFuncDir, '.vc-config.json');
    await fs.ensureDir(extraFuncDir);
    await fs.writeJson(extraConfigPath, {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap: {
        'dep.js': 'node_modules/example/index.js',
        'chunk.js': '.next/server/chunks/foo.js',
        'yarn.js': '.yarn/cache/foo.zip',
        'pnp.cjs': '.pnp.cjs',
        'venv.py': '.venv/lib/python.py',
        pyc: '__pycache__/foo.pyc',
        bin: 'target/release/app',
      },
    });

    try {
      await withDefaultFilePathMap(
        cwd,
        {
          'index.js': 'safe-handler.js',
          'escaped.txt': '../outside.txt',
        },
        async () => {
          const { fileList } = await buildFileTree(
            cwd,
            {
              isDirectory: true,
              prebuilt: true,
              vercelOutputDir: join(cwd, '.vercel/output'),
            },
            noop
          );

          const normalized = normalizeWindowsPaths(fileList);
          const included = (rel: string) =>
            normalizeWindowsPaths([join(cwd, rel)])[0];

          // Duplicate source-upload defaults must not drop NFT-traced deps
          expect(normalized).toContain(
            included('node_modules/example/index.js')
          );
          expect(normalized).toContain(included('.next/server/chunks/foo.js'));
          expect(normalized).toContain(included('.yarn/cache/foo.zip'));
          expect(normalized).toContain(included('.pnp.cjs'));
          expect(normalized).toContain(included('.venv/lib/python.py'));
          expect(normalized).toContain(included('__pycache__/foo.pyc'));
          expect(normalized).toContain(included('target/release/app'));
        }
      );
    } finally {
      await fs.remove(extraFuncDir);
    }
  });

  it('should keep NFT-traced pnpm store files that match `node_modules/` in `.vercelignore` when prebuilt=true', async () => {
    // Regression: Toyota `arrow-ecommerce-app` (PIPE-7143). After #17211,
    // `--prebuilt` re-applied `.vercelignore` to `filePathMap`, so a
    // `node_modules/` rule dropped pnpm store paths Next.js had traced.
    // Remote hydrate then failed with:
    // ENOENT: lstat '.../node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/cjs/_interop_require_default.cjs'
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const pnpmStoreFile =
      'node_modules/.pnpm/@swc+helpers@0.5.15/node_modules/@swc/helpers/cjs/_interop_require_default.cjs';
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/pnpm-store.func'
    );
    const extraConfigPath = join(extraFuncDir, '.vc-config.json');
    const storeFilePath = join(cwd, pnpmStoreFile);

    await fs.ensureDir(extraFuncDir);
    await fs.outputFile(storeFilePath, 'module.exports = {};\n');
    await fs.writeJson(extraConfigPath, {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap: {
        '_interop_require_default.cjs': pnpmStoreFile,
      },
    });

    try {
      await withDefaultFilePathMap(
        cwd,
        {
          'index.js': 'safe-handler.js',
          'escaped.txt': '../outside.txt',
        },
        async () => {
          const { fileList } = await buildFileTree(
            cwd,
            {
              isDirectory: true,
              prebuilt: true,
              vercelOutputDir: join(cwd, '.vercel/output'),
            },
            noop
          );

          const normalized = normalizeWindowsPaths(fileList);
          expect(normalized).toContain(
            normalizeWindowsPaths([storeFilePath])[0]
          );
        }
      );
    } finally {
      await fs.remove(extraFuncDir);
      await fs.remove(join(cwd, 'node_modules/.pnpm'));
    }
  });

  it('should reject `filePathMap` entries that escape the deployment root when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    await withDefaultFilePathMap(
      cwd,
      {
        'index.js': 'safe-handler.js',
        'escaped.txt': '../outside.txt',
      },
      async () => {
        const { fileList } = await buildFileTree(
          cwd,
          {
            isDirectory: true,
            prebuilt: true,
            vercelOutputDir: join(cwd, '.vercel/output'),
          },
          noop
        );

        expect(
          normalizeWindowsPaths(fileList).some(f => f.endsWith('outside.txt'))
        ).toBe(false);
      }
    );
  });

  it('should allow lowercase `cvs` directories in `filePathMap` when prebuilt=true', async () => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const sourcePath = join(cwd, 'src/app/api/cvs/route.ts');
    const rootPath = join(cwd, 'src/app/api/cvs/Root');
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/lowercase-cvs.func'
    );

    await fs.outputFile(sourcePath, 'export default function handler() {}\n');
    await fs.outputFile(rootPath, 'application data\n');
    await fs.outputJson(join(extraFuncDir, '.vc-config.json'), {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap: {
        'route.js': 'src/app/api/cvs/route.ts',
        root: 'src/app/api/cvs/Root',
      },
    });

    try {
      const { fileList } = await buildFileTree(
        cwd,
        {
          isDirectory: true,
          prebuilt: true,
          vercelOutputDir: join(cwd, '.vercel/output'),
        },
        noop
      );

      expect(normalizeWindowsPaths(fileList)).toContain(
        normalizeWindowsPaths([sourcePath])[0]
      );
      expect(normalizeWindowsPaths(fileList)).toContain(
        normalizeWindowsPaths([rootPath])[0]
      );
    } finally {
      await fs.remove(extraFuncDir);
      await fs.remove(join(cwd, 'src/app/api/cvs'));
    }
  });

  it.for([
    ['CVS/Root', 'cvs/Root'],
    ['CVS/Root', 'CVS/root'],
    ['CVS/Root', 'cVs/rOoT'],
    ['CVS/Base/revision', 'cvs/base/revision'],
  ])('should reject a case alias of %s in `filePathMap`', async ([
    actualPath,
    mapPath,
  ], context) => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    await fs.outputFile(join(cwd, actualPath), 'metadata\n');

    try {
      if (!(await fs.pathExists(join(cwd, mapPath)))) {
        context.skip();
        return;
      }

      await withDefaultFilePathMap(cwd, { metadata: mapPath }, async () => {
        await expect(
          buildFileTree(
            cwd,
            {
              isDirectory: true,
              prebuilt: true,
              vercelOutputDir: join(cwd, '.vercel/output'),
            },
            noop
          )
        ).rejects.toMatchObject({ code: 'PREBUILT_FILEPATHMAP_VCS' });
      });
    } finally {
      await fs.remove(join(cwd, 'CVS'));
    }
  });

  it('should allow a separate lowercase `cvs` directory next to `CVS`', async context => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const lowercaseRoot = join(cwd, 'cvs/Root');
    await fs.outputFile(join(cwd, 'CVS/Root'), 'metadata\n');

    try {
      if (await fs.pathExists(lowercaseRoot)) {
        context.skip();
        return;
      }

      await fs.outputFile(lowercaseRoot, 'application data\n');
      await withDefaultFilePathMap(cwd, { root: 'cvs/Root' }, async () => {
        const { fileList } = await buildFileTree(
          cwd,
          {
            isDirectory: true,
            prebuilt: true,
            vercelOutputDir: join(cwd, '.vercel/output'),
          },
          noop
        );
        expect(normalizeWindowsPaths(fileList)).toContain(
          normalizeWindowsPaths([lowercaseRoot])[0]
        );
      });
    } finally {
      await fs.remove(join(cwd, 'CVS'));
      await fs.remove(join(cwd, 'cvs'));
    }
  });

  it.each([
    ['uppercase CVS metadata', 'CVS/Entries'],
    ['mixed-case Git metadata', '.GIT/config'],
  ])('should reject %s in `filePathMap` when prebuilt=true', async (_description, vcsPath) => {
    const cwd = fixture('prebuilt-filepathmap-ignore');
    const sourcePath = join(cwd, vcsPath);
    const extraFuncDir = join(
      cwd,
      '.vercel/output/functions/api/vcs-metadata.func'
    );

    await fs.outputFile(sourcePath, 'metadata\n');
    await fs.outputJson(join(extraFuncDir, '.vc-config.json'), {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      filePathMap: {
        metadata: vcsPath,
      },
    });

    try {
      await expect(
        buildFileTree(
          cwd,
          {
            isDirectory: true,
            prebuilt: true,
            vercelOutputDir: join(cwd, '.vercel/output'),
          },
          noop
        )
      ).rejects.toMatchObject({ code: 'PREBUILT_FILEPATHMAP_VCS' });
    } finally {
      await fs.remove(extraFuncDir);
      await fs.remove(join(cwd, vcsPath.split('/')[0]));
    }
  });

  it('monorepo - should find root files but ignore `.vercel/output` files when prebuilt=false', async () => {
    const cwd = fixture('monorepo-boa');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      { isDirectory: true, prebuilt: false },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      'foo.txt',
      'sub/bar.txt',
      'apps/blog/foo.txt',
      'apps/blog/sub/bar.txt',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = ['apps/blog/.gitignore', 'apps/blog/.vercel'];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('monorepo - should find `.vercel/output` files but ignore other files when prebuilt=true', async () => {
    const cwd = fixture('monorepo-boa');
    const { fileList, ignoreList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, 'apps/blog/.vercel/output'),
      },
      noop
    );

    const expectedFileList = toAbsolutePaths(cwd, [
      'apps/blog/.vercel/output/functions/api/another.func/.vc-config.json',
      'apps/blog/.vercel/output/functions/api/example.func/.vc-config.json',
      'apps/blog/.vercel/output/static/baz.txt',
      'apps/blog/.vercel/output/static/sub/qux.txt',
      'node_modules/another/index.js',
      'node_modules/example/index.js',
    ]);
    expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
      normalizeWindowsPaths(fileList).sort()
    );

    const expectedIgnoreList = [
      'apps/blog/.gitignore',
      'apps/blog/foo.txt',
      'apps/blog/sub',
      'foo.txt',
      'sub',
    ];
    expect(normalizeWindowsPaths(expectedIgnoreList).sort()).toEqual(
      normalizeWindowsPaths(ignoreList).sort()
    );
  });

  it('microfrontend monorepo - should find `microfrontends.json` when prebuilt=true', async () => {
    const cwd = fixture('microfrontend');

    const { fileList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, 'marketing-app/.vercel/output'),
        rootDirectory: 'marketing-app',
      },
      noop
    );

    const microfrontendsConfig = toAbsolutePaths(cwd, [
      'marketing-app/microfrontends.json',
    ]);
    expect(normalizeWindowsPaths(fileList)).toContain(
      normalizeWindowsPaths(microfrontendsConfig)[0]
    );
  });

  it('microfrontend monorepo - should infer `microfrontends.json` when prebuilt=true', async () => {
    const cwd = fixture('microfrontend');

    const { fileList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, 'marketing-app/.vercel/output'),
        projectName: 'marketing-app',
      },
      noop
    );

    const microfrontendsConfig = toAbsolutePaths(cwd, [
      'marketing-app/microfrontends.json',
    ]);
    expect(normalizeWindowsPaths(fileList)).toContain(
      normalizeWindowsPaths(microfrontendsConfig)[0]
    );
  });

  it('should include bulkRedirectsPath file when prebuilt=true', async () => {
    const cwd = fixture('bulk-redirects-path');
    const { fileList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, '.vercel/output'),
        bulkRedirectsPath: 'redirects.json',
      },
      noop
    );

    const bulkRedirectsFile = toAbsolutePaths(cwd, ['redirects.json']);
    expect(normalizeWindowsPaths(fileList)).toContain(
      normalizeWindowsPaths(bulkRedirectsFile)[0]
    );
  });

  it('should include all files from bulkRedirectsPath directory when prebuilt=true', async () => {
    const cwd = fixture('bulk-redirects-dir');
    const { fileList } = await buildFileTree(
      cwd,
      {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: join(cwd, '.vercel/output'),
        bulkRedirectsPath: 'redirects',
      },
      noop
    );

    const expectedFiles = toAbsolutePaths(cwd, [
      'redirects/redirects1.json',
      'redirects/redirects2.json',
    ]);
    const normalizedFileList = normalizeWindowsPaths(fileList);
    for (const expectedFile of normalizeWindowsPaths(expectedFiles)) {
      expect(normalizedFileList).toContain(expectedFile);
    }
  });

  describe('Rust `target/` directory', () => {
    // The `target/` directory is `.gitignore`d repo-wide, so it can't be
    // committed as a fixture. Create it at runtime instead.
    const rustFixtures = ['rust-target', 'rust-target-with-ignore'];

    beforeEach(async () => {
      for (const name of rustFixtures) {
        const cwd = fixture(name);
        await fs.mkdirp(join(cwd, 'target', 'debug'));
        await fs.mkdirp(join(cwd, 'target', 'release'));
        await fs.writeFile(join(cwd, 'target', 'debug', 'binary'), 'debug');
        await fs.writeFile(join(cwd, 'target', 'release', 'binary'), 'release');
      }
    });

    afterEach(async () => {
      for (const name of rustFixtures) {
        await fs.remove(join(fixture(name), 'target'));
      }
    });

    it('should exclude `target/` by default for Rust projects', async () => {
      const cwd = fixture('rust-target');
      const { fileList, ignoreList } = await buildFileTree(
        cwd,
        { isDirectory: true },
        noop
      );

      const expectedFileList = toAbsolutePaths(cwd, [
        'Cargo.toml',
        'src/main.rs',
      ]);
      expect(normalizeWindowsPaths(expectedFileList).sort()).toEqual(
        normalizeWindowsPaths(fileList).sort()
      );

      expect(normalizeWindowsPaths(ignoreList)).toContain('target');
    });

    it('should allow re-including `target/` via `.vercelignore`', async () => {
      const cwd = fixture('rust-target-with-ignore');
      const { fileList } = await buildFileTree(
        cwd,
        { isDirectory: true },
        noop
      );

      const normalized = normalizeWindowsPaths(fileList);
      const expected = normalizeWindowsPaths(
        toAbsolutePaths(cwd, ['target/debug/binary'])
      )[0];
      expect(normalized).toContain(expected);
    });
  });
});
