import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { wrapAnsi } from '../../../../src/commands/ship/wrap';

/**
 * Raw sequences rather than chalk. Chalk emits nothing when it detects no
 * colour support, which is the case under a test runner, so an assertion about
 * escape handling written with chalk would run on unstyled text and assert
 * nothing.
 */
const BOLD = '\x1b[1m';
const UNBOLD = '\x1b[22m';
const CYAN = '\x1b[36m';
const UNCYAN = '\x1b[39m';
const RESET = '\x1b[0m';

describe('ship wrapAnsi', () => {
  it('breaks on words at the given width', () => {
    const lines = wrapAnsi('one two three four five', 9);

    expect(lines).toEqual(['one two', 'three', 'four five']);
  });

  it('leaves text that already fits', () => {
    expect(wrapAnsi('short enough', 40)).toEqual(['short enough']);
  });

  it('indents every line after the first', () => {
    const lines = wrapAnsi('one two three four', 12, '    ');

    expect(lines).toEqual(['one two', '    three', '    four']);
  });

  it('measures the visible text, not the escape sequences', () => {
    // Styled, the string is far longer than the width; visibly it fits.
    const styled = `${BOLD}one${UNBOLD} ${CYAN}two${UNCYAN}`;

    expect(wrapAnsi(styled, 8)).toEqual([styled]);
  });

  it('keeps a style open across a break instead of losing it', () => {
    const styled = `${BOLD}alpha beta gamma${UNBOLD}`;
    const lines = wrapAnsi(styled, 11);

    expect(lines.map(stripAnsi)).toEqual(['alpha beta', 'gamma']);
    // The break closes the style and the next line reopens it, so bold cannot
    // bleed into the gutter of the line that follows.
    expect(lines[0].endsWith(RESET)).toBe(true);
    expect(lines[1].startsWith(BOLD)).toBe(true);
  });

  it('does not reopen a style that closed before the break', () => {
    const styled = `${BOLD}alpha${UNBOLD} beta gamma delta`;
    const lines = wrapAnsi(styled, 11);

    expect(lines.map(stripAnsi)).toEqual(['alpha beta', 'gamma delta']);
    expect(lines[1]).not.toContain(BOLD);
  });

  it('leaves a word longer than the width intact', () => {
    // URLs and paths are worth more unbroken than aligned.
    const url = 'https://widget-abc123-acme.vercel.app';
    const lines = wrapAnsi(`see ${url} now`, 12);

    expect(lines).toEqual(['see', url, 'now']);
  });

  it('returns the input unchanged for a nonsensical width', () => {
    expect(wrapAnsi('anything', 0)).toEqual(['anything']);
  });

  it('handles an empty string', () => {
    expect(wrapAnsi('', 40)).toEqual(['']);
  });
});
