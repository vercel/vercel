import { progress } from '../../../src/util/output/progress';

describe('progress()', () => {
  test.each([
    { current: 0, total: 5, opts: { width: 5 }, expected: '_____' },
    { current: 1, total: 5, opts: { width: 5 }, expected: '=____' },
    { current: 2, total: 5, opts: { width: 5 }, expected: '==___' },
    { current: 3, total: 5, opts: { width: 5 }, expected: '===__' },
    { current: 4, total: 5, opts: { width: 5 }, expected: '====_' },
    { current: 5, total: 5, opts: { width: 5 }, expected: '=====' },
    { current: 0, total: 12, expected: '____________________' },
    { current: 1, total: 12, expected: '=___________________' },
    { current: 2, total: 12, expected: '===_________________' },
    { current: 600, total: 1200, expected: '===_________________' },
  ])('$current / $total -> $expected', ({ current, total, opts, expected }) => {
    expect(progress(current, total, opts)).toEqual(expected);
  });
});
