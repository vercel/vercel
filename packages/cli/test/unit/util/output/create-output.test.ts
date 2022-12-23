import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';

describe('Output', () => {
  describe('link()', () => {
    it('should return hyperlink ANSI codes when `supportsHyperlink=true`', () => {
      client.output.supportsHyperlink = true;
      const val = client.output.link('Click Here', 'https://example.com');
      expect(val).toEqual(
        '\x1B]8;;https://example.com\x07Click Here\x1B]8;;\x07'
      );
      expect(stripAnsi(val)).toEqual('Click Here');
    });

    it('should return default fallback when `supportsHyperlink=false`', () => {
      client.output.supportsHyperlink = false;
      const val = client.output.link('Click Here', 'https://example.com');
      expect(val).toEqual('Click Here (https://example.com)');
    });

    it('should return text fallback when `supportsHyperlink=false` with `fallback: false`', () => {
      client.output.supportsHyperlink = false;
      const val = client.output.link('Click Here', 'https://example.com', {
        fallback: false,
      });
      expect(val).toEqual('Click Here');
    });

    it('should return fallback when `supportsHyperlink=false` with `fallback` function', () => {
      client.output.supportsHyperlink = false;
      const val = client.output.link('Click Here', 'https://example.com', {
        fallback: () => 'other',
      });
      expect(val).toEqual('other');
    });
  });
});
