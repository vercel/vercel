import { join, sep } from 'path';
// @ts-ignore - Missing types for "alpha-sort"
import { asc as alpha } from 'alpha-sort';
import { staticFiles as getStaticFiles_ } from '../../../src/util/get-files';
import { client } from '../../mocks/client';

const prefix = `${join(__dirname, '../../fixtures/unit')}${sep}`;
const base = (path: string) => path.replace(prefix, '');
const fixture = (name: string) => join(prefix, name);

const getStaticFiles = async (dir: string) => {
  const files = await getStaticFiles_(dir, client);
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
});
