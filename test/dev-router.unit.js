import path from 'path'
import test from 'ava';

import { readLocalConfig } from '../src/util/config/files';
import devRouter from '../src/commands/dev/lib/dev-router';

test('dev-router', t => {
  const dir = path.join(__dirname, 'fixtures/unit/dev-router');
  const nowJson = readLocalConfig(dir);

  const route = devRouter('/api/user', nowJson.routes);

  t.is(route.dest, '/endpoints/api/user');
  t.is(route.status, undefined);
  t.is(route.headers, undefined);
  t.deepEqual(route.uri_args, {});
});
