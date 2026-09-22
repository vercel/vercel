import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, sep } from 'path';
import os from 'os';
import fs from 'fs-extra';
// @ts-ignore - Missing types for "alpha-sort"
import { asc as alpha } from 'alpha-sort';
import { staticFiles as getStaticFiles_ } from '../../../src/util/get-files';

const prefix = `${join(__dirname, '../../fixtures/unit')}${sep}`;
const base = (path: string) => path.replace(prefix, '');
const fixture = (name: string) => join(prefix, name);

const getStaticFiles = async (dir: string) => {
  const files = await getStaticFiles_(dir, {});
  return normalizeWindowsPaths(files);
};

const normalizeWindowsPaths = (files: string[]) => {
  if (process.platform === 'win32') {
    // GitHub Actions absolute path "f" that looks like:
    // "D:/a/vercel/vercel/packages/cli/test/fixtures/unit/"
    // but other OS's are relative path so we normalize here.
    const prefix = 'packages/cli/test/fixtures/unit/';
    return files.map(f => {
      const normal = f.replace(/\\/g, '/');
      const i = normal.indexOf(prefix);
      return normal.slice(i + prefix.length);
    });
  }
  return files;
};

describe('staticFiles', () => {
  it('should discover files for builds deployment', async () => {
    const path = 'now-json-static-no-files';
    let files = await getStaticFiles(fixture(path));
    files = files.sort(alpha);

    expect(files).toHaveLength(4);
    expect(base(files[0])).toEqual(`${path}/a.js`);
    expect(base(files[1])).toEqual(`${path}/b.js`);
    expect(base(files[2])).toEqual(`${path}/build/a/c.js`);
    expect(base(files[3])).toEqual(`${path}/package.json`);
  });

  it('should respect `.vercelignore` file rules', async () => {
    const path = 'vercelignore';
    let files = await getStaticFiles(fixture(path));
    files = files.sort(alpha);

    expect(files).toHaveLength(6);
    expect(base(files[0])).toEqual(`${path}/.vercelignore`);
    expect(base(files[1])).toEqual(`${path}/a.js`);
    expect(base(files[2])).toEqual(`${path}/build/sub/a.js`);
    expect(base(files[3])).toEqual(`${path}/build/sub/c.js`);
    expect(base(files[4])).toEqual(`${path}/c.js`);
    expect(base(files[5])).toEqual(`${path}/package.json`);
  });

  describe('when a directory is removed mid-scan', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should skip the removed directory instead of throwing', async () => {
      const dir = await fs.mkdtemp(join(os.tmpdir(), 'vc-get-files-'));
      try {
        await fs.mkdirp(join(dir, 'keep'));
        await fs.writeFile(join(dir, 'keep', 'a.js'), '');
        await fs.mkdirp(join(dir, 'gone'));
        await fs.writeFile(join(dir, 'gone', 'b.js'), '');

        // Simulate a directory (e.g. cargo's `target/`) being deleted between
        // the `stat()` and `readdir()` calls during the recursive scan.
        const realReaddir = fs.readdir.bind(fs);
        vi.spyOn(fs, 'readdir').mockImplementation(((
          p: string,
          ...rest: any[]
        ) => {
          if (typeof p === 'string' && p.endsWith(`${sep}gone`)) {
            const err: NodeJS.ErrnoException = new Error(
              `ENOENT: no such file or directory, scandir '${p}'`
            );
            err.code = 'ENOENT';
            return Promise.reject(err);
          }
          return realReaddir(p, ...rest);
        }) as unknown as typeof fs.readdir);

        const files = normalizeWindowsPaths(await getStaticFiles_(dir, {}));
        const names = files.map(f => f.replace(/\\/g, '/'));

        expect(names.some(f => f.endsWith('/keep/a.js'))).toBe(true);
        expect(names.some(f => f.endsWith('/gone/b.js'))).toBe(false);
      } finally {
        await fs.remove(dir);
      }
    });
  });
});
