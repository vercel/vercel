import { isZeroConfigBuild } from '../../../src/util/is-zero-config-build';

describe('isZeroConfigBuild', () => {
  it(`should return true when builds is undefined`, () => {
    expect(isZeroConfigBuild(undefined)).toEqual(true);
  });

  it('should return true when builds is an empty list', () => {
    expect(isZeroConfigBuild([])).toEqual(true);
  });

  it('should return true if all builds are set to be zeroConfig builds', () => {
    const builds = [
      {
        src: 'package.json',
        use: '@vercel/static-build',
        config: {
          zeroConfig: true,
        },
      },
    ];
    expect(isZeroConfigBuild(builds)).toEqual(true);
  });

  it('should return false if any builds are not configured to be zeroConfig builds', () => {
    const builds = [
      {
        src: 'package.json',
        use: '@vercel/static-build',
        config: {
          zeroConfig: true,
        },
      },
      {
        src: 'package.json',
        use: '@vercel/static-build',
      },
    ];
    expect(isZeroConfigBuild(builds)).toEqual(false);
  });
});
