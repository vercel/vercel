import { PassThrough } from 'stream';
import type * as tty from 'tty';
import chalk from 'chalk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import output from '../../../../src/output-manager';
import { Output } from '../../../../src/util/output/create-output';

afterEach(() => {
  chalk.level = 0;
});

function createTestOutput(options: { noColor?: boolean } = {}) {
  const stream = new PassThrough();
  const testOutput = new Output(stream as unknown as tty.WriteStream, options);
  return {
    output: testOutput,
    read: () => stream.read()?.toString() ?? '',
  };
}

describe('Output', () => {
  describe('fatal()', () => {
    it('prints a red fatal glyph and indents explicit continuation lines', () => {
      chalk.level = 1;
      const testOutput = createTestOutput();

      testOutput.output.fatal('Failed to save.\nRun `vercel env add` again.');

      const value = testOutput.read();
      expect(value).toContain('\u001b[31m✗\u001b[39m');
      expect(stripAnsi(value)).toBe(
        '✗ Failed to save.\n  Run `vercel env add` again.\n'
      );
    });

    it('keeps the fatal glyph and removes ANSI when color is disabled', () => {
      chalk.level = 1;
      const testOutput = createTestOutput({ noColor: true });

      testOutput.output.fatal('Failed to save.');

      expect(testOutput.read()).toBe('✗ Failed to save.\n');
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
