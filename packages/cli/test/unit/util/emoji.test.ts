import { describe, expect, it } from 'vitest';
import { removeEmoji } from '../../../src/util/emoji';

describe('removeEmoji', () => {
  it('trims leading whitespace after removing a leading emoji', () => {
    expect(removeEmoji('💡  hello')).toBe('hello');
  });

  it('preserves a leading newline for multiline messages', () => {
    expect(removeEmoji('\n  ▲ vercel dev')).toBe('\n  ▲ vercel dev');
  });

  it('trims leading whitespace when there is no leading newline', () => {
    expect(removeEmoji('  no emoji here')).toBe('no emoji here');
  });
});
