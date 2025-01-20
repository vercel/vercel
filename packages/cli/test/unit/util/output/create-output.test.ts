import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import output from '../../../../src/output-manager';

describe('Output', () => {
  describe('link()', () => {
    it('should return hyperlink ANSI codes when `supportsHyperlink=true`', () => {
      output.initialize({ supportsHyperlink: true });
      const val = output.link('Click Here', 'https://example.com');
      expect(val).toEqual(
        '\x1B]8;;https://example.com\x07Click Here\x1B]8;;\x07'
      );
      expect(stripAnsi(val)).toEqual('Click Here');
    });

    it('should return default fallback when `supportsHyperlink=false`', () => {
      output.initialize({ supportsHyperlink: false });
      const val = output.link('Click Here', 'https://example.com');
      expect(val).toEqual('Click Here (https://example.com)');
    });

    it('should return text fallback when `supportsHyperlink=false` with `fallback: false`', () => {
      output.initialize({ supportsHyperlink: false });
      const val = output.link('Click Here', 'https://example.com', {
        fallback: false,
      });
      expect(val).toEqual('Click Here');
    });

    it('should return fallback when `supportsHyperlink=false` with `fallback` function', () => {
      output.initialize({ supportsHyperlink: false });
      const val = output.link('Click Here', 'https://example.com', {
        fallback: () => 'other',
      });
      expect(val).toEqual('other');
    });
  });
});
