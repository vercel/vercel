import test from 'ava';
import { join, resolve } from 'path';
import _getFiles from '../lib/get-files';
import hash from '../lib/hash';
import { asc as alpha } from 'alpha-sort';

const prefix = join(__dirname, '_fixtures') + '/';
const base = (path) => path.replace(prefix, '');
const fixture = (name) => resolve(`./_fixtures/${name}`);

// overload to force debugging
const getFiles = (dir) => _getFiles(dir, null, true);

test('`files` + README', async t => {
  let files = await getFiles(fixture('files-in-package'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(base(files[0]), 'files-in-package/build/a/b/c/d.js');
  t.is(base(files[1]), 'files-in-package/build/a/e.js');
  t.is(base(files[2]), 'files-in-package/package.json');
});

test('`files` + README + `.*.swp` + `.npmignore`', async t => {
  let files = await getFiles(fixture('files-in-package-ignore'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(base(files[0]), 'files-in-package-ignore/build/a/b/c/d.js');
  t.is(base(files[1]), 'files-in-package-ignore/build/a/e.js');
  t.is(base(files[2]), 'files-in-package-ignore/package.json');
});

test('simple', async t => {
  let files = await getFiles(fixture('simple'));
  t.is(files.length, 5);
  files = files.sort(alpha);
  t.is(base(files[0]), 'simple/bin/test');
  t.is(base(files[1]), 'simple/index.js');
  t.is(base(files[2]), 'simple/lib/woot');
  t.is(base(files[3]), 'simple/lib/woot.jsx');
  t.is(base(files[4]), 'simple/package.json');
});

test('simple with main', async t => {
  let files = await getFiles(fixture('simple-main'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(base(files[0]), 'simple-main/build/a.js');
  t.is(base(files[1]), 'simple-main/index.js');
  t.is(base(files[2]), 'simple-main/package.json');
});

test('hashes', async t => {
  const files = await getFiles(fixture('hashes'));
  const hashes = await hash(files);
  t.is(hashes.size, 3);
  t.is(hashes.get('277c55a2042910b9fe706ad00859e008c1b7d172').names[0], prefix + 'hashes/dei.png');
  t.is(hashes.get('277c55a2042910b9fe706ad00859e008c1b7d172').names[1], prefix + 'hashes/duplicate/dei.png');
  t.is(hashes.get('56c00d0466fc6bdd41b13dac5fc920cc30a63b45').names[0], prefix + 'hashes/index.js');
  t.is(hashes.get('706214f42ae940a01d2aa60c5e32408f4d2127dd').names[0], prefix + 'hashes/package.json');
});

test('ignore node_modules', async t => {
  let files = await getFiles(fixture('no-node_modules'));
  files = files.sort(alpha);
  t.is(base(files[0]), 'no-node_modules/index.js');
  t.is(base(files[1]), 'no-node_modules/package.json');
});
