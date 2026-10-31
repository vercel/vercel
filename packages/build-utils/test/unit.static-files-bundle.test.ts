import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import FileFsRef from '../src/file-fs-ref';
import { staticBundleExclusions, type StaticMount } from '../src/static-files';

const mount = (urlPath: string, directory: string): StaticMount => ({
  urlPath,
  directory,
  fallback: null,
  frontend: false,
  html: false,
});

describe('staticBundleExclusions', () => {
  const workPath = '/work';

  it('returns exclude patterns and directory stubs for each mount', () => {
    const result = staticBundleExclusions(
      [mount('/static', '/work/my_files')],
      workPath,
      []
    );
    expect(result.excludePatterns).toEqual(['my_files/**']);
    expect(Object.keys(result.directoryStubs)).toEqual([
      'my_files/.static-placeholder',
    ]);
  });

  it('handles multiple mounts', () => {
    const result = staticBundleExclusions(
      [mount('/static', '/work/static'), mount('/assets', '/work/assets')],
      workPath,
      []
    );
    expect(result.excludePatterns).toEqual(['static/**', 'assets/**']);
    expect(Object.keys(result.directoryStubs)).toEqual([
      'static/.static-placeholder',
      'assets/.static-placeholder',
    ]);
  });

  it('skips mounts outside workPath (and workPath itself)', () => {
    const result = staticBundleExclusions(
      [mount('/static', '/other/static'), mount('/', '/work')],
      workPath,
      []
    );
    expect(result).toEqual({ excludePatterns: [], directoryStubs: {} });
  });

  describe('keepFiles', () => {
    let root: string;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(tmpdir(), 'static-files-bundle-'));
    });
    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('keeps only the listed files that exist in the mount directory', () => {
      const dir = path.join(root, 'dist');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'index.html'), '');
      fs.writeFileSync(path.join(dir, 'app.js'), '');
      const result = staticBundleExclusions([mount('/', dir)], root, [
        'index.html',
        '404.html',
      ]);
      expect(Object.keys(result.directoryStubs)).toEqual([
        'dist/.static-placeholder',
        'dist/index.html',
      ]);
      const kept = result.directoryStubs['dist/index.html'];
      expect(kept).toBeInstanceOf(FileFsRef);
      expect((kept as FileFsRef).fsPath).toBe(path.join(dir, 'index.html'));
    });
  });
});
