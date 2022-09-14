import { progress } from '../../../../src/util/output/progress';

describe('progress()', () => {
  test.each([
    { current: 0, total: 5, opts: { width: 5 }, expected: '-----' },
    { current: 1, total: 5, opts: { width: 5 }, expected: '=----' },
    { current: 2, total: 5, opts: { width: 5 }, expected: '==---' },
    { current: 3, total: 5, opts: { width: 5 }, expected: '===--' },
    { current: 4, total: 5, opts: { width: 5 }, expected: '====-' },
    { current: 5, total: 5, opts: { width: 5 }, expected: '=====' },
    { current: 0, total: 12, expected: '--------------------' },
    { current: 1, total: 12, expected: '=-------------------' },
    { current: 2, total: 12, expected: '===-----------------' },
    { current: 600, total: 1200, expected: '==========----------' },
    {
      current: 9,
      total: 10,
      opts: { complete: '.', incomplete: ' ', width: 10 },
      expected: '......... ',
    },
    { current: 10, total: 10, expected: '====================' },
    { current: 11, total: 10, expected: null },
    { current: -1, total: 10, expected: null },
    { current: 1, total: 0, expected: null },
  ])(
    '$current / $total -> "$expected"',
    ({ current, total, opts, expected }) => {
      expect(progress(current, total, opts)).toEqual(expected);
    }
  );
});
