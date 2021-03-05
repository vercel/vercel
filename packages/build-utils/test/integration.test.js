const path = require('path');
const fs = require('fs-extra');
const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment');
const { glob, detectBuilders } = require('../');

jest.setTimeout(4 * 60 * 1000);

const builderUrl = '@canary';
let buildUtilsUrl;

beforeAll(async () => {
  const buildUtilsPath = path.resolve(__dirname, '..');
  buildUtilsUrl = await packAndDeploy(buildUtilsPath);
  console.log('buildUtilsUrl', buildUtilsUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (fixture.includes('zero-config')) {
    // Those have separate tests
    continue; // eslint-disable-line no-continue
  }

  // eslint-disable-next-line no-loop-func
  it(`Should build "${fixture}"`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture)
      )
    ).resolves.toBeDefined();
  });
}

// few foreign tests

const buildersToTestWith = ['now-node'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath2 = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath2)) {
    // don't run all foreign fixtures, just some
    if (['01-cowsay', '01-cache-headers', '03-env-vars'].includes(fixture)) {
      // eslint-disable-next-line no-loop-func
      it(`Should build "${builder}/${fixture}"`, async () => {
        await expect(
          testDeployment(
            { builderUrl, buildUtilsUrl },
            path.join(fixturesPath2, fixture)
          )
        ).resolves.toBeDefined();
      });
    }
  }
}

it('Test `detectBuilders` and `detectRoutes`', async () => {
  const fixture = path.join(__dirname, 'fixtures', '01-zero-config-api');
  const pkg = await fs.readJSON(path.join(fixture, 'package.json'));
  const fileList = await glob('**', fixture);
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

  const deployment = await testDeployment(
    { builderUrl, buildUtilsUrl },
    fixture
  );
  expect(deployment).toBeDefined();
});

it('Test `detectBuilders` with `index` files', async () => {
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const pkg = await fs.readJSON(path.join(fixture, 'package.json'));
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

  const deployment = await testDeployment(
    { builderUrl, buildUtilsUrl },
    fixture
  );
  expect(deployment).toBeDefined();
});
