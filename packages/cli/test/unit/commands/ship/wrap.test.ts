import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import {
  truncateAnsi,
  visibleWidth,
  wrapAnsi,
} from '../../../../src/commands/ship/wrap';

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

describe('ship visibleWidth', () => {
  it('counts ASCII by character', () => {
    expect(visibleWidth('hello')).toBe(5);
  });

  it('ignores escape sequences', () => {
    expect(visibleWidth(`${BOLD}hello${UNBOLD}`)).toBe(5);
  });

  it('counts a CJK ideograph as two columns', () => {
    // What a terminal actually draws: one ideograph fills two cells.
    expect(visibleWidth('日本語')).toBe(6);
    expect(visibleWidth('한국어')).toBe(6);
  });

  it('counts an emoji as two columns, not as its code points', () => {
    expect(visibleWidth('😀')).toBe(2);
  });

  it('counts a multi-code-point emoji as one cluster', () => {
    // Family emoji: several code points joined, drawn in one place.
    expect(visibleWidth('👩‍👩‍👧‍👦')).toBe(2);
  });

  it('gives a combining mark no width of its own', () => {
    // "e" plus a combining acute is one cell, the same as the composed form.
    expect(visibleWidth('e\u0301')).toBe(1);
    expect(visibleWidth('é')).toBe(1);
  });

  it('counts halfwidth kana as one column', () => {
    expect(visibleWidth('ｱｲｳ')).toBe(3);
  });
});

describe('ship wrapAnsi with wide characters', () => {
  it('wraps on columns rather than characters', () => {
    // Six ideographs are twelve columns, so a width of eight takes four.
    const lines = wrapAnsi('日本語日本語', 8);

    expect(lines).toEqual(['日本語日', '本語']);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(8);
    }
  });

  it('breaks a long CJK run, which has no spaces to break at', () => {
    const lines = wrapAnsi('あ'.repeat(20), 10);

    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(10);
    }
  });

  it('still leaves a long unbreakable word intact', () => {
    // A URL is worth more whole than aligned, and has no valid break points.
    const url = 'https://widget-abc123-acme.vercel.app/a/very/long/path';
    expect(wrapAnsi(url, 20)).toEqual([url]);
  });

  it('never splits an emoji across lines', () => {
    const lines = wrapAnsi('ab 😀😀😀', 5);

    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(5);
      expect(line).not.toContain('\ud83d\ude00'.slice(0, 1) + ' ');
    }
    expect(lines.join('')).toContain('😀😀😀');
  });

  it('keeps a hanging indent measured in columns', () => {
    const lines = wrapAnsi('one two three four', 12, '  ');

    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(12);
    }
    expect(lines.slice(1).every(line => line.startsWith('  '))).toBe(true);
  });
});

describe('ship truncateAnsi with wide characters', () => {
  it('cuts on columns, leaving room for the ellipsis', () => {
    const result = truncateAnsi('日本語日本語', 7);

    expect(visibleWidth(result)).toBeLessThanOrEqual(7);
    expect(result.endsWith('…')).toBe(true);
  });

  it('never cuts inside a cluster', () => {
    // Cutting between the letter and its accent would move the accent onto the
    // ellipsis, which is how mojibake gets printed.
    const result = truncateAnsi(`abcde\u0301fgh`, 5);

    expect(result).not.toContain('\u0301…');
    expect(visibleWidth(result)).toBeLessThanOrEqual(5);
  });

  it('leaves text that already fits', () => {
    expect(truncateAnsi('日本', 10)).toBe('日本');
  });
});
