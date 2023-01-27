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
      launcherType: 'Nodejs',
    },
    {
      title: 'typescript Node-compliant signature',
      entrypoint: 'node/index.ts',
      launcherType: 'Nodejs',
    },
    {
      title: 'typesciprt, Node-compliant, incomplete signature',
      entrypoint: 'node/incomplete.ts',
      launcherType: 'Nodejs',
    },
    {
      title: 'ESM Web-compliant signature',
      entrypoint: 'edge/index.mjs',
      launcherType: 'EdgeLight',
    },
    {
      title: 'typescript Web-compliant signature',
      entrypoint: 'edge/index.ts',
      launcherType: 'EdgeLight',
    },
  ])(
    'detects $title as $launcherType launcher type',
    ({ entrypoint, launcherType }) => {
      expect(
        detectServerlessLauncherType(join(fixtureFolder, entrypoint), 18)
      ).toEqual(launcherType);
    }
  );

  it.each([{ nodeMajorVersion: 14 }, { nodeMajorVersion: 16 }])(
    'throws when EdgeLight launcher type used on node $nodeMajorVersion',
    ({ nodeMajorVersion }) => {
      expect(() =>
        detectServerlessLauncherType(
          join(fixtureFolder, 'edge/index.mjs'),
          nodeMajorVersion
        )
      ).toThrow(
        'EdgeLight launcher type can only be used with node.js 18 and later'
      );
    }
  );
});
