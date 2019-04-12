import path from 'path';
import test from 'ava';
import * as buildUtils from '@now/build-utils';
import shouldServe from '../src/commands/dev/lib/default-should-serve';

test('shouldServe on should-serve-nodejs', async (t) => {
  const cwd = path.resolve(__dirname, 'fixture/unit/should-serve-nodejs');
  const files = await buildUtils.glob('**', cwd);

  t.is(shouldServe({
    files,
    entrypoint: 'index.js',
    requestPath: 'index.js'
  }), true);

  t.is(shouldServe({
    files,
    entrypoint: 'index.js',
    requestPath: '/'
  }), true);

  // This is same behavior as in production
  t.is(shouldServe({
    files,
    entrypoint: 'index.js',
    requestPath: 'index.js/'
  }), true);

  t.is(shouldServe({
    files,
    entrypoint: 'index.js',
    requestPath: 'index'
  }), false);

  t.is(shouldServe({
    files,
    entrypoint: 'subdir/index.js',
    requestPath: 'subdir'
  }), true);

  t.is(shouldServe({
    files,
    entrypoint: 'subdir/index.js',
    requestPath: 'subdir/'
  }), true);
});
