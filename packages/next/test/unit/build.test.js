const path = require('node:path');
const fs = require('fs-extra');
const { build } = require('../../dist');

function getFixture(name) {
  return path.join(__dirname, 'fixtures', name);
}

const initialCorepackValue = process.env.COREPACK_ENABLE_STRICT;

beforeEach(() => {
  process.env.COREPACK_ENABLE_STRICT = '0';
});

afterEach(() => {
  process.env.COREPACK_ENABLE_STRICT = initialCorepackValue;
});

it('should include cron property from config', async () => {
  const cwd = getFixture('03-with-api-routes');
  await fs.remove(path.join(cwd, '.next'));

  const result = await build({
    workPath: cwd,
    repoRootPath: cwd,
    entrypoint: 'package.json',
    config: {
      functions: {
        'pages/api/edge.js': {
          cron: '* * * * *',
        },
        'pages/api/serverless.js': {
          cron: '* * * * *',
        },
      },
    },
    meta: {
      skipDownload: true,
    },
  });

  expect(result.output['api/serverless']).toHaveProperty('cron', '* * * * *');
  expect(result.output['api/edge']).toHaveProperty('cron', '* * * * *');
});
