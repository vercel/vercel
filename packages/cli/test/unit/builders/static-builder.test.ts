import { describe, expect, test } from 'vitest';
import type { FileBlob, Files } from '@vercel/build-utils';
import { MANIFEST_FILENAME, MANIFEST_VERSION } from '@vercel/build-utils';
import { build, diagnostics } from '../../../src/builders/static-builder';

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

describe('static-builder diagnostics()', () => {
  function parseResult(files: Files): Record<string, unknown> | null {
    const blob = files[MANIFEST_FILENAME] as FileBlob | undefined;
    if (!blob) return null;
    return JSON.parse(blob.data as string);
  }

  test('manifest has correct shape for a plain static build', async () => {
    const files = await diagnostics({} as Parameters<typeof diagnostics>[0]);
    expect(parseResult(files)).toEqual({
      version: MANIFEST_VERSION,
      runtime: 'static',
      buildType: 'app',
      dependencies: [],
    });
  });
});
