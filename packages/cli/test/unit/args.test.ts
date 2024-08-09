import { describe, expect, it } from 'vitest';
import { help } from '../../src/args';

describe('base level help output', () => {
  it('help', () => {
    expect(help()).toMatchSnapshot();
  });
});
