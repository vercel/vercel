import { describe, expect, it } from 'vitest';
import { pinBuilderSpecs } from '../../src/import-builders';

const versions = new Map([
  ['@vercel/static-build', '9.0.2'],
  ['@vercel/node', '5.5.1'],
  ['@vercel/python', '5.0.0'],
]);

describe('pinBuilderSpecs()', () => {
  it('pins bare specs and the explicit default latest tag', () => {
    expect(
      pinBuilderSpecs(
        new Set([
          '@vercel/static-build@latest',
          '@vercel/node',
          '@vercel/python@canary',
          '@vercel/node@5.4.0',
        ]),
        versions
      )
    ).toEqual(
      new Map([
        ['@vercel/static-build@latest', '@vercel/static-build@9.0.2'],
        ['@vercel/node', '@vercel/node@5.5.1'],
      ])
    );
  });

  it('uses preview tarball URLs for default specs', () => {
    const previewUrl =
      'https://preview.vercel.sh/tarballs/vercel-static-build.tgz';
    expect(
      pinBuilderSpecs(
        new Set(['@vercel/static-build@latest']),
        new Map([['@vercel/static-build', previewUrl]])
      )
    ).toEqual(new Map([['@vercel/static-build@latest', previewUrl]]));
  });
});
