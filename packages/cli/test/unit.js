import { join, sep } from 'path';
import test from 'ava';
import { asc as alpha } from 'alpha-sort';
import createOutput from '../src/util/output';
import { staticFiles as getStaticFiles_ } from '../src/util/get-files';

const output = createOutput({ debug: false });
const prefix = `${join(__dirname, 'fixtures', 'unit')}${sep}`;
const base = path => path.replace(prefix, '');
const fixture = name => join(prefix, name);

const getStaticFiles = async dir => {
  const files = await getStaticFiles_(dir, {
    output,
  });
  return normalizeWindowsPaths(files);
};

const normalizeWindowsPaths = files => {
  if (process.platform === 'win32') {
    const prefix = 'D:/a/vercel/vercel/packages/cli/test/fixtures/unit/';
    return files.map(f => f.replace(/\\/g, '/').slice(prefix.length));
  }
  return files;
};

test('discover files for builds deployment', async t => {
  const path = 'now-json-static-no-files';
  let files = await getStaticFiles(fixture(path), true);
  files = files.sort(alpha);

  t.is(files.length, 4);

  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/package.json`);
});

test('should observe .vercelignore file', async t => {
  const path = 'vercelignore';
  let files = await getStaticFiles(fixture(path));
  files = files.sort(alpha);

  t.is(files.length, 6);

  t.is(base(files[0]), `${path}/.vercelignore`);
  t.is(base(files[1]), `${path}/a.js`);
  t.is(base(files[2]), `${path}/build/sub/a.js`);
  t.is(base(files[3]), `${path}/build/sub/c.js`);
  t.is(base(files[4]), `${path}/c.js`);
  t.is(base(files[5]), `${path}/package.json`);
});
