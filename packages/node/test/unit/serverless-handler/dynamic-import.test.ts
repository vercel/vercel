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

    let buffer = '';
    const headers: Record<string, string> = {};

    const res = {
      send: (data: string) => {
        buffer = data;
        return res;
      },
      setHeader: (key: string, value: string) => (headers[key] = value),
      end: () => {},
    };

    const req = {};

    fn.default(req, res);

    expect(buffer).toBe('Hello, world!');
    expect(headers).toStrictEqual({ 'x-hello': 'world' });
  });
});
