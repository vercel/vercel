import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../src/args';

describe('base level help output', () => {
  it('help', () => {
    expect(stripAnsi(help())).toMatchSnapshot();
  });
});
