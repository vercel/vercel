import { PassThrough } from 'stream';
import type * as tty from 'tty';
import chalk from 'chalk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { Diagnostic } from 'nostics';
import output from '../../../../src/output-manager';
import { Output } from '../../../../src/util/output/create-output';
import chars from '../../../../src/util/output/chars';
import { dev } from '../../../../src/util/dev/diagnostics';

afterEach(() => {
  chalk.level = 0;
});

function createTestOutput(
  options: { noColor?: boolean; hideSpinners?: boolean } = {}
) {
  const stream = new PassThrough();
  const testOutput = new Output(stream as unknown as tty.WriteStream, options);
  return {
    output: testOutput,
    read: () => stream.read()?.toString() ?? '',
  };
}

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
  describe('spinner()', () => {
    it('prints the message once when the stream is not a terminal', () => {
      const { output: testOutput, read } = createTestOutput();
      testOutput.spinner('Loading teams…');
      testOutput.stopSpinner();
      expect(read()).toBe('Loading teams…\n');
    });

    it('prints nothing when spinners are hidden for agents', () => {
      const { output: testOutput, read } = createTestOutput({
        hideSpinners: true,
      });
      testOutput.spinner('Loading teams…');
      testOutput.stopSpinner();
      expect(read()).toBe('');
      expect(testOutput.spinnersHidden).toBe(true);
    });

    it('can hide spinners after it was created', () => {
      const { output: testOutput, read } = createTestOutput();
      testOutput.initialize({ hideSpinners: true });
      testOutput.spinner('Building…', 0);
      testOutput.print('done\n');
      expect(read()).toBe('done\n');
    });
  });

  describe('formatStatus()', () => {
    it('colors only the indicator and keeps the status label readable', () => {
      chalk.level = 1;
      const testOutput = createTestOutput();

      expect(testOutput.output.formatStatus('Ready', 'success')).toBe(
        `${chalk.green(chars.dot)} Ready`
      );
      expect(testOutput.read()).toBe('');
    });

    it('keeps the dot and label without ANSI when color is disabled', () => {
      chalk.level = 1;
      const testOutput = createTestOutput({ noColor: true });

      expect(testOutput.output.formatStatus('Stopped', 'muted')).toBe(
        `${chars.dot} Stopped`
      );
    });
  });

  describe('fatal()', () => {
    it('prints a red fatal glyph and indents explicit continuation lines', () => {
      chalk.level = 1;
      const testOutput = createTestOutput();

      testOutput.output.fatal('Failed to save.\nRun `vercel env add` again.');

      const value = testOutput.read();
      expect(value).toContain(`\u001b[31m${chars.fatal}\u001b[39m`);
      expect(stripAnsi(value)).toBe(
        `${chars.fatal} Failed to save.\n  Run \`vercel env add\` again.\n`
      );
    });

    it('keeps the fatal glyph and removes ANSI when color is disabled', () => {
      chalk.level = 1;
      const testOutput = createTestOutput({ noColor: true });

      testOutput.output.fatal('Failed to save.');

      expect(testOutput.read()).toBe(`${chars.fatal} Failed to save.\n`);
    });

    it('does not terminate the process', () => {
      const exit = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const testOutput = createTestOutput({ noColor: true });

      testOutput.output.fatal('Failed to save.');

      expect(exit).not.toHaveBeenCalled();
      exit.mockRestore();
    });
  });

  describe('warning()', () => {
    it('prints a yellow ! gutter and indents explicit continuation lines', () => {
      chalk.level = 1;
      const testOutput = createTestOutput();

      testOutput.output.warning('Token expires soon.\nRun `vercel login`.');

      const value = testOutput.read();
      expect(value).toContain(`\u001b[33m${chars.warning}\u001b[39m`);
      expect(stripAnsi(value)).toBe(
        `${chars.warning} Token expires soon.\n  Run \`vercel login\`.\n`
      );
      expect(value).not.toContain('WARNING!');
    });

    it('keeps the ! gutter and removes ANSI when color is disabled', () => {
      chalk.level = 1;
      const testOutput = createTestOutput({ noColor: true });

      testOutput.output.warning('Token expires soon.');

      expect(testOutput.read()).toBe('! Token expires soon.\n');
    });
  });

  describe('error()', () => {
    it('preserves the legacy Error label', () => {
      const testOutput = createTestOutput({ noColor: true });

      testOutput.output.error('Failed to save.');

      expect(testOutput.read()).toBe('Error: Failed to save.\n');
    });
  });

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
