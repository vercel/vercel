import { describe, expect, test } from 'vitest';
import $ from 'tinyspawn';

const evalScript = (code: string, flags: string[] = []) =>
  $('node', ['--eval', code, ...flags]).then(({ stdout }) => stdout);
evalScript.esm = code => evalScript(code, ['--input-type', 'module']);

describe('@vercel/functions', () => {
  const EXPECTED_METHODS = [
    'geolocation',
    'getEnv',
    'ipAddress',
    'next',
    'rewrite',
    'waitUntil',
  ];

  test('load as CommonJS', async () => {
    const code =
      "console.log(JSON.stringify(Object.keys(require('@vercel/functions'))))";
    const exportedMethods = await evalScript(code).then(output =>
      JSON.parse(output)
    );
    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });

  test('load as ESM', async () => {
    const code =
      "import f from '@vercel/functions'; console.log(JSON.stringify(Object.keys(f)))";
    const exportedMethods = await evalScript
      .esm(code)
      .then(output => JSON.parse(output));
    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });
});

describe('@vercel/functions/oidc', () => {
  const EXPECTED_METHODS = [
    'awsCredentialsProvider',
    'getVercelOidcToken',
    'getVercelOidcTokenSync',
  ];

  test('load as CommonJS', async () => {
    const code =
      "console.log(JSON.stringify(Object.keys(require('@vercel/functions/oidc'))))";
    const exportedMethods = await evalScript(code).then(output =>
      JSON.parse(output)
    );

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });

  test('load as ESM', async () => {
    const code =
      "import f from '@vercel/functions/oidc'; console.log(JSON.stringify(Object.keys(f)))";
    const exportedMethods = await evalScript
      .esm(code)
      .then(output => JSON.parse(output));

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });
});

describe('@vercel/functions/headers', () => {
  const EXPECTED_METHODS = [
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
  ];

  test('load as CommonJS', async () => {
    const code =
      "console.log(JSON.stringify(Object.keys(require('@vercel/functions/headers'))))";
    const exportedMethods = await evalScript(code).then(output =>
      JSON.parse(output)
    );

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });

  test('load as ESM', async () => {
    const code =
      "import f from '@vercel/functions/headers'; console.log(JSON.stringify(Object.keys(f)))";
    const exportedMethods = await evalScript
      .esm(code)
      .then(output => JSON.parse(output));

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });
});

describe('@vercel/functions/middleware', () => {
  const EXPECTED_METHODS = ['next', 'rewrite'];

  test('load as CommonJS', async () => {
    const code =
      "console.log(JSON.stringify(Object.keys(require('@vercel/functions/middleware'))))";
    const exportedMethods = await evalScript(code).then(output =>
      JSON.parse(output)
    );

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });

  test('load as ESM', async () => {
    const code =
      "import f from '@vercel/functions/middleware'; console.log(JSON.stringify(Object.keys(f)))";
    const exportedMethods = await evalScript
      .esm(code)
      .then(output => JSON.parse(output));

    expect(exportedMethods).toEqual(EXPECTED_METHODS);
  });
});
