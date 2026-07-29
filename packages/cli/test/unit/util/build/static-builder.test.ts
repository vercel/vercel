import { describe, expect, test } from 'vitest';
import type { Files } from '@vercel/build-utils';
import { build } from '../../../../src/util/build/static-builder';

function toFiles(names: string[]): Files {
  return Object.fromEntries(names.map(name => [name, {} as Files[string]]));
}

describe('static-builder build()', () => {
  test('excludes platform config files from static output', async () => {
    const files = toFiles([
      'index.html',
      'vercel.json',
      'vercel.toml',
      'vercel.ts',
      'vercel.mts',
      'vercel.js',
      'vercel.mjs',
      'vercel.cjs',
      '.vercelignore',
      'now.json',
      '.nowignore',
    ]);

    const result = await build({
      entrypoint: '',
      files,
      config: {},
    } as Parameters<typeof build>[0]);

    if (!('output' in result)) {
      throw new Error('Expected a typical build result with `output`');
    }
    expect(Object.keys(result.output)).toEqual(['index.html']);
  });
});
