import { entrypointToOutputPath } from '../../src/utils';

describe('entrypointToOutputPath()', () => {
  test.each([
    { entrypoint: 'api/foo.js', zeroConfig: false, expected: 'api/foo.js' },
    { entrypoint: 'api/foo.ts', zeroConfig: false, expected: 'api/foo.ts' },
    { entrypoint: 'api/foo.tsx', zeroConfig: false, expected: 'api/foo.tsx' },
    { entrypoint: 'api/foo.js', zeroConfig: true, expected: 'api/foo' },
    { entrypoint: 'api/foo.ts', zeroConfig: true, expected: 'api/foo' },
    { entrypoint: 'api/foo.tsx', zeroConfig: true, expected: 'api/foo' },
  ])(
    'entrypoint="$entrypoint" zeroConfig=$zeroConfig -> $expected',
    ({ entrypoint, zeroConfig, expected }) => {
      expect(entrypointToOutputPath(entrypoint, zeroConfig)).toEqual(expected);
    }
  );
});
