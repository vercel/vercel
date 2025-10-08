import execa from 'execa';

test('esm contains all exports', async () => {
  const { stdout } = await execa(
    `node`,
    [
      `-e`,
      `import('../dist/index.mjs').then(Object.keys).then(JSON.stringify).then(console.log)`,
    ],
    { cwd: __dirname }
  );
  const keys = new Set(JSON.parse(stdout));
  expect(keys).toEqual(
    new Set([
      'CITY_HEADER_NAME',
      'COUNTRY_HEADER_NAME',
      'EMOJI_FLAG_UNICODE_STARTING_POSITION',
      'IP_HEADER_NAME',
      'LATITUDE_HEADER_NAME',
      'LONGITUDE_HEADER_NAME',
      'POSTAL_CODE_HEADER_NAME',
      'REGION_HEADER_NAME',
      'REQUEST_ID_HEADER_NAME',
      'geolocation',
      'ipAddress',
      'next',
      'rewrite',
    ])
  );
});

test('cjs contains all exports', async () => {
  const { stdout } = await execa(
    `node`,
    [
      `-e`,
      `Promise.resolve(require('../dist/index.js')).then(Object.keys).then(JSON.stringify).then(console.log)`,
    ],
    { cwd: __dirname }
  );
  const keys = new Set(JSON.parse(stdout));
  expect(keys).toEqual(
    new Set([
      'CITY_HEADER_NAME',
      'COUNTRY_HEADER_NAME',
      'EMOJI_FLAG_UNICODE_STARTING_POSITION',
      'IP_HEADER_NAME',
      'LATITUDE_HEADER_NAME',
      'LONGITUDE_HEADER_NAME',
      'POSTAL_CODE_HEADER_NAME',
      'REGION_HEADER_NAME',
      'REQUEST_ID_HEADER_NAME',
      'geolocation',
      'ipAddress',
      'next',
      'rewrite',
    ])
  );
});
