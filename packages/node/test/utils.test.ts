import {
  checkLauncherCompatibility,
  detectServerlessLauncherType,
  entrypointToOutputPath,
  NodejRuntime,
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
  it.each([
    {
      title: 'no configuration',
      config: undefined,
      launcherType: 'Nodejs',
    },
    {
      title: 'configuration with no runtime',
      config: {},
      launcherType: 'Nodejs',
    },
    {
      title: 'configured nodejs runtime',
      config: { runtime: NodejRuntime.WinterCG },
      launcherType: 'WinterCG',
    },
  ])(
    'detects $title as $launcherType launcher type',
    ({ config, launcherType }) => {
      expect(detectServerlessLauncherType(config, 18)).toEqual(launcherType);
    }
  );
});

describe('checkLauncherCompatibility()', () => {
  const entrypoint = 'api/isomorphic.js';

  it.each([{ nodeMajorVersion: 14 }, { nodeMajorVersion: 16 }])(
    'throws when EdgeLight launcher type used on node $nodeMajorVersion',
    ({ nodeMajorVersion }) => {
      expect(() =>
        checkLauncherCompatibility(entrypoint, 'WinterCG', nodeMajorVersion)
      ).toThrow(
        `${entrypoint}: configured runtime "${NodejRuntime.WinterCG}" can only be used with Node.js 18 and newer`
      );
    }
  );
});
