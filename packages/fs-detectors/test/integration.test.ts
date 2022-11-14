import path from 'path';
import { promises } from 'fs';
import { glob } from '@vercel/build-utils';
import { detectBuilders } from '../src';
const fs = promises;

import {
  testDeployment,
  // @ts-ignore
} from '../../../test/lib/deployment/test-deployment';

jest.setTimeout(4 * 60 * 1000);

it('Test `detectBuilders` and `detectRoutes`', async () => {
  const fixture = path.join(__dirname, 'fixtures', '01-zero-config-api');
  const json = await fs.readFile(path.join(fixture, 'package.json'), 'utf8');
  const pkg = JSON.parse(json);
  const fileList = await glob('**', { cwd: fixture });
  const files = Object.keys(fileList);

  const probes = [
    {
      path: '/api/my-endpoint',
      mustContain: 'my-endpoint',
      status: 200,
    },
    {
      path: '/api/other-endpoint',
      mustContain: 'other-endpoint',
      status: 200,
    },
    {
      path: '/api/team/zeit',
      mustContain: 'team/zeit',
      status: 200,
    },
    {
      path: '/api/user/myself',
      mustContain: 'user/myself',
      status: 200,
    },
    {
      path: '/api/not-okay/',
      status: 404,
    },
    {
      path: '/api',
      status: 404,
    },
    {
      path: '/api/',
      status: 404,
    },
    {
      path: '/',
      mustContain: 'hello from index.txt',
    },
  ];

  const { builders, defaultRoutes } = await detectBuilders(files, pkg);

  const nowConfig = { builds: builders, routes: defaultRoutes, probes };

  await fs.writeFile(
    path.join(fixture, 'now.json'),
    JSON.stringify(nowConfig, null, 2)
  );

  const deployment = await testDeployment(fixture);
  expect(deployment).toBeDefined();
});

it('Test `detectBuilders` with `index` files', async () => {
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const json = await fs.readFile(path.join(fixture, 'package.json'), 'utf8');
  const pkg = JSON.parse(json);
  const fileList = await glob('**', fixture);
  const files = Object.keys(fileList);

  const probes = [
    {
      path: '/api/not-okay',
      status: 404,
    },
    {
      path: '/api',
      mustContain: 'hello from api/index.js',
      status: 200,
    },
    {
      path: '/api/',
      mustContain: 'hello from api/index.js',
      status: 200,
    },
    {
      path: '/api/index',
      mustContain: 'hello from api/index.js',
      status: 200,
    },
    {
      path: '/api/index.js',
      mustContain: 'hello from api/index.js',
      status: 200,
    },
    {
      path: '/api/date.js',
      mustContain: 'hello from api/date.js',
      status: 200,
    },
    {
      // Someone might expect this to be `date.js`,
      // but I doubt that there is any case were both
      // `date/index.js` and `date.js` exists,
      // so it is not special cased
      path: '/api/date',
      mustContain: 'hello from api/date/index.js',
      status: 200,
    },
    {
      path: '/api/date/',
      mustContain: 'hello from api/date/index.js',
      status: 200,
    },
    {
      path: '/api/date/index',
      mustContain: 'hello from api/date/index.js',
      status: 200,
    },
    {
      path: '/api/date/index.js',
      mustContain: 'hello from api/date/index.js',
      status: 200,
    },
    {
      path: '/',
      mustContain: 'hello from index.txt',
    },
  ];

  const { builders, defaultRoutes } = await detectBuilders(files, pkg);

  const nowConfig = { builds: builders, routes: defaultRoutes, probes };
  await fs.writeFile(
    path.join(fixture, 'now.json'),
    JSON.stringify(nowConfig, null, 2)
  );

  const deployment = await testDeployment(fixture);
  expect(deployment).toBeDefined();
});
