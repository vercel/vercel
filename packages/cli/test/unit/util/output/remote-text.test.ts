import { describe, expect, it } from 'vitest';
import { remoteText } from '../../../../src/util/output/remote-text';

describe('remoteText', () => {
  it('drops escape sequences and control characters', () => {
    expect(remoteText('\u001b[31mdenied\u001b[0m\u0007\u009b')).toBe('denied');
  });

  it('drops bidirectional and zero-width format characters', () => {
    expect(remoteText('ab\u202Edc\u200Bef\uFEFF')).toBe('abdcef');
  });

  it('shows newlines as escapes, so the text stays on one line', () => {
    expect(remoteText('first\nsecond\r\nthird')).toBe('first\\nsecond\\nthird');
  });

  it('leaves ordinary text alone', () => {
    expect(remoteText('Tunnel refused: not allowed (tnl_1)')).toBe(
      'Tunnel refused: not allowed (tnl_1)'
    );
  });
});
