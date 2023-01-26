import { join } from 'node:path';
import {
  detectServerlessLauncherType,
  entrypointToOutputPath,
} from '../src/utils';

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

describe('detectServerlessLauncherType()', () => {
  const fixtureFolder = join(__dirname, 'detection-fixtures');

  it.each([
    {
      title: 'commonjs, Node-compliant signature',
      entrypoint: 'node/index.js',
      runtime: '18.x',
      launcherType: 'Nodejs',
    },
    {
      title: 'typescript Node-compliant signature',
      entrypoint: 'node/index.ts',
      runtime: '18.x',
      launcherType: 'Nodejs',
    },
    {
      title: 'ESM Web-compliant signature',
      entrypoint: 'edge/index.mjs',
      runtime: '18.x',
      launcherType: 'edge-light',
    },
    {
      title: 'typescript Web-compliant signature',
      entrypoint: 'edge/index.ts',
      runtime: 'nodejs18.x',
      launcherType: 'edge-light',
    },
  ])(
    'detects $title as $launcherType launcher type',
    ({ entrypoint, runtime, launcherType }) => {
      expect(
        detectServerlessLauncherType(join(fixtureFolder, entrypoint), runtime)
      ).toEqual(launcherType);
    }
  );

  it.each([
    { runtime: '14.x' },
    { runtime: '16.x' },
    { runtime: 'nodejs14.x' },
    { runtime: 'nodejs16.x' },
  ])(
    'throws when edge-light launcher type used on runtime $runtime',
    ({ runtime }) => {
      expect(() =>
        detectServerlessLauncherType(
          join(fixtureFolder, 'edge/index.mjs'),
          runtime
        )
      ).toThrow(
        'edge-light launcher type can only be used with node.js 18 and later'
      );
    }
  );
});
