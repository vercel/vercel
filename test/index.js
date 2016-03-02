import test from 'ava';
import { join, resolve } from 'path';
import getFiles from '../lib/get-files';
import hash from '../lib/hash';
import { asc as alpha } from 'alpha-sort';

const prefix = join(__dirname, '_fixtures') + '/';
const base = (path) => path.replace(prefix, '');
const fixture = (name) => resolve(`./_fixtures/${name}`);

test('`files` + README', async t => {
  let files = await getFiles(fixture('files-in-package'));
  t.same(files.length, 3);
  files = files.sort(alpha);
  t.same(base(files[0]), 'files-in-package/build/a/b/c/d.js');
  t.same(base(files[1]), 'files-in-package/build/a/e.js');
  t.same(base(files[2]), 'files-in-package/package.json');
});

test('`files` + README + `.*.swp` + `.npmignore`', async t => {
  let files = await getFiles(fixture('files-in-package-ignore'));
  t.same(files.length, 3);
  files = files.sort(alpha);
  t.same(base(files[0]), 'files-in-package-ignore/build/a/b/c/d.js');
  t.same(base(files[1]), 'files-in-package-ignore/build/a/e.js');
  t.same(base(files[2]), 'files-in-package-ignore/package.json');
});

test('simple', async t => {
  let files = await getFiles(fixture('simple'));
  t.same(files.length, 5);
  files = files.sort(alpha);
  t.same(base(files[0]), 'simple/bin/test');
  t.same(base(files[1]), 'simple/index.js');
  t.same(base(files[2]), 'simple/lib/woot');
  t.same(base(files[3]), 'simple/lib/woot.jsx');
  t.same(base(files[4]), 'simple/package.json');
});

test('simple with main', async t => {
  let files = await getFiles(fixture('simple-main'));
  t.same(files.length, 3);
  files = files.sort(alpha);
  t.same(base(files[0]), 'simple-main/build/a.js');
  t.same(base(files[1]), 'simple-main/index.js');
  t.same(base(files[2]), 'simple-main/package.json');
});

test('hashes', async t => {
  const files = await getFiles(fixture('hashes'));
  const hashes = await hash(files);
  t.same(hashes.size, 3);
  t.same(hashes.get('277c55a2042910b9fe706ad00859e008c1b7d172').name, prefix + 'hashes/dei.png');
  t.same(hashes.get('56c00d0466fc6bdd41b13dac5fc920cc30a63b45').name, prefix + 'hashes/index.js');
  t.same(hashes.get('706214f42ae940a01d2aa60c5e32408f4d2127dd').name, prefix + 'hashes/package.json');
});

test('ignore node_modules', async t => {
  let files = await getFiles(fixture('no-node_modules'));
  files = files.sort(alpha);
  t.same(base(files[0]), 'no-node_modules/index.js');
  t.same(base(files[1]), 'no-node_modules/package.json');
});
