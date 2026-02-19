import { join, resolve } from 'path';
import fs from 'fs-extra';
import { buildFileTree, shouldUseInlineFiles, prepareFiles } from '../src/utils';
import type { FilesMap } from '../src/utils/hashes';
import type { VercelClientOptions } from '../src/types';
import { describe, expect, it } from 'vitest';

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

    const [folderLinkPath, indexLinkPath] = await Promise.all([
      fs.lstat(join(cwd, 'folder-link')),
      fs.lstat(join(cwd, 'index-link.txt')),
    ]);
    expect(folderLinkPath.isSymbolicLink());
    expect(folderLinkPath.isDirectory());
    expect(indexLinkPath.isSymbolicLink());
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
});

describe('shouldUseInlineFiles()', () => {
  const createFilesMap = (
    files: Array<{ name: string; content: string }>
  ): FilesMap => {
    const map: FilesMap = new Map();
    files.forEach((file, index) => {
      const data = Buffer.from(file.content, 'utf-8');
      map.set(`sha${index}`, {
        names: [file.name],
        data,
        mode: 0o644,
      });
    });
    return map;
  };

  it('should return true for less than 10 HTML files', () => {
    const files = createFilesMap([
      { name: '/project/index.html', content: '<html></html>' },
      { name: '/project/about.html', content: '<html></html>' },
      { name: '/project/contact.html', content: '<html></html>' },
    ]);
    expect(shouldUseInlineFiles(files)).toBe(true);
  });

  it('should return true for .htm files', () => {
    const files = createFilesMap([
      { name: '/project/index.htm', content: '<html></html>' },
      { name: '/project/about.HTM', content: '<html></html>' },
    ]);
    expect(shouldUseInlineFiles(files)).toBe(true);
  });

  it('should return false when non-HTML files are present', () => {
    const files = createFilesMap([
      { name: '/project/index.html', content: '<html></html>' },
      { name: '/project/style.css', content: 'body {}' },
    ]);
    expect(shouldUseInlineFiles(files)).toBe(false);
  });

  it('should return false when there are 10 or more files', () => {
    const htmlFiles = Array.from({ length: 10 }, (_, i) => ({
      name: `/project/page${i}.html`,
      content: '<html></html>',
    }));
    const files = createFilesMap(htmlFiles);
    expect(shouldUseInlineFiles(files)).toBe(false);
  });

  it('should return true when there are exactly 9 files', () => {
    const htmlFiles = Array.from({ length: 9 }, (_, i) => ({
      name: `/project/page${i}.html`,
      content: '<html></html>',
    }));
    const files = createFilesMap(htmlFiles);
    expect(shouldUseInlineFiles(files)).toBe(true);
  });

  it('should return false for JavaScript files', () => {
    const files = createFilesMap([
      { name: '/project/index.js', content: 'console.log("hi")' },
    ]);
    expect(shouldUseInlineFiles(files)).toBe(false);
  });

  it('should handle case-insensitive HTML extensions', () => {
    const files = createFilesMap([
      { name: '/project/index.HTML', content: '<html></html>' },
      { name: '/project/about.Html', content: '<html></html>' },
    ]);
    expect(shouldUseInlineFiles(files)).toBe(true);
  });
});

describe('prepareFiles() with inline files', () => {
  const createFilesMap = (
    files: Array<{ name: string; content: string }>
  ): FilesMap => {
    const map: FilesMap = new Map();
    files.forEach((file, index) => {
      const data = Buffer.from(file.content, 'utf-8');
      map.set(`sha${index}`, {
        names: [file.name],
        data,
        mode: 0o644,
      });
    });
    return map;
  };

  it('should include data and encoding for inlined HTML files', () => {
    const files = createFilesMap([
      { name: '/project/index.html', content: '<html><body>Hello</body></html>' },
    ]);
    const clientOptions: VercelClientOptions = {
      token: 'test-token',
      path: '/project',
      isDirectory: true,
    };

    const prepared = prepareFiles(files, clientOptions);

    expect(prepared).toHaveLength(1);
    expect(prepared[0].file).toBe('index.html');
    expect(prepared[0].data).toBe('<html><body>Hello</body></html>');
    expect(prepared[0].encoding).toBe('utf-8');
    // Inlined files should NOT have sha, size, or mode (API rejects additional properties)
    expect(prepared[0].sha).toBeUndefined();
    expect(prepared[0].size).toBeUndefined();
    expect(prepared[0].mode).toBeUndefined();
  });

  it('should use SHA reference for non-HTML files', () => {
    const files = createFilesMap([
      { name: '/project/script.js', content: 'console.log("hi")' },
    ]);
    const clientOptions: VercelClientOptions = {
      token: 'test-token',
      path: '/project',
      isDirectory: true,
    };

    const prepared = prepareFiles(files, clientOptions);

    expect(prepared).toHaveLength(1);
    expect(prepared[0].file).toBe('script.js');
    expect(prepared[0].sha).toBe('sha0');
    expect(prepared[0].data).toBeUndefined();
    expect(prepared[0].encoding).toBeUndefined();
  });

  it('should use SHA reference when file count exceeds limit', () => {
    const htmlFiles = Array.from({ length: 10 }, (_, i) => ({
      name: `/project/page${i}.html`,
      content: `<html>Page ${i}</html>`,
    }));
    const files = createFilesMap(htmlFiles);
    const clientOptions: VercelClientOptions = {
      token: 'test-token',
      path: '/project',
      isDirectory: true,
    };

    const prepared = prepareFiles(files, clientOptions);

    expect(prepared).toHaveLength(10);
    prepared.forEach(file => {
      expect(file.sha).toBeDefined();
      expect(file.data).toBeUndefined();
      expect(file.encoding).toBeUndefined();
    });
  });
});
