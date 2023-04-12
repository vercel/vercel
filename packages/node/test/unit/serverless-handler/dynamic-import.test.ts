// @ts-expect-error
import { dynamicImport } from '../../../src/serverless-functions/dynamic-import.js';
import { resolve } from 'path';

describe('dynamic-import', () => {
  test('load esm code', async () => {
    const entrypointPath = resolve(
      __dirname,
      '../../dev-fixtures/esm-module.mjs'
    );
    const fn = await dynamicImport(entrypointPath);
    expect(fn.default.toString()).toStrictEqual(
      "(_req, res) => {\n  res.setHeader('x-hello', 'world');\n  res.send('Hello, world!').end();\n}"
    );
  });
});
