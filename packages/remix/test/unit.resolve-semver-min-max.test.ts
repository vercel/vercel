import { resolveSemverMinMax } from '../src/utils';

describe('resolveSemverMinMax()', () => {
  it.each([
    { min: '1.0.0', max: '1.15.0', version: '0.9.0', expected: '1.0.0' },
    { min: '1.0.0', max: '1.15.0', version: '1.0.0', expected: '1.0.0' },
    { min: '1.0.0', max: '1.15.0', version: '1.1.0', expected: '1.1.0' },
    { min: '1.0.0', max: '1.15.0', version: '1.10.0', expected: '1.10.0' },
    { min: '1.0.0', max: '1.15.0', version: '1.15.0', expected: '1.15.0' },
    { min: '1.0.0', max: '1.15.0', version: '1.16.0', expected: '1.15.0' },
    { min: '1.0.0', max: '1.15.0', version: '^1.12.0', expected: '^1.12.0' },
    { min: '1.0.0', max: '1.15.0', version: '0.x.x', expected: '1.0.0' },
    { min: '1.0.0', max: '2.0.0', version: '1.x.x', expected: '1.x.x' },
    { min: '1.0.0', max: '2.0.0', version: '2.x.x', expected: '2.x.x' },
    { min: '1.0.0', max: '2.0.0', version: '^2.0.0', expected: '^2.0.0' },
  ])(
    'Should return "$expected" for version "$version" (min=$min, max=$max)',
    ({ min, max, version, expected }) => {
      const actual = resolveSemverMinMax(min, max, version);
      expect(actual).toEqual(expected);
    }
  );
});
