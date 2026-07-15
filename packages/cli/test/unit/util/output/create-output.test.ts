import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { Diagnostic } from 'nostics';
import output from '../../../../src/output-manager';
import { dev } from '../../../../src/util/dev/diagnostics';

function captureStderr(fn: () => void): string {
  let out = '';
  const fake = {
    write: (str: string) => {
      out += str;
      return true;
    },
    isTTY: false,
  } as unknown as NodeJS.WriteStream;
  output.initialize({ stream: fake });
  try {
    fn();
  } finally {
    output.initialize({ stream: process.stderr });
  }
  return stripAnsi(out);
}

describe('Output', () => {
  describe('prettyError() with a Diagnostic', () => {
    it('renders the code, message, fix, and docs link', () => {
      // Exercise a real catalog code that carries all three fields, rather than
      // a hand-built Diagnostic, so the test reflects what actually ships.
      const d = dev.DEV_RECURSIVE_INVOCATION();

      const out = captureStderr(() => output.prettyError(d));
      expect(out).toContain(
        'Error: [DEV_RECURSIVE_INVOCATION] `vercel dev` must not recursively invoke itself'
      );
      expect(out).toContain('Fix:');
      expect(out).toContain(
        'https://vercel.link/recursive-invocation-of-commands'
      );
    });

    it('omits the code prefix when the diagnostic has no code', () => {
      const d = new Diagnostic({ why: 'something failed' });
      const out = captureStderr(() => output.prettyError(d));
      expect(out).toContain('Error: something failed');
      expect(out).not.toContain('[');
    });
  });
});

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
