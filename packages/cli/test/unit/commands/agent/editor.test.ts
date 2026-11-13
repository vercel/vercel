import type { Editor } from '../../../../src/commands/agent/tui/editor';
import { describe, expect, it } from 'vitest';
import {
  backspace,
  deleteForward,
  editorOf,
  insert,
  killToEnd,
  killToStart,
  killWord,
  layout,
  lineDown,
  lineEnd,
  lineStart,
  lineUp,
  wordLeft,
  wordRight,
} from '../../../../src/commands/agent/tui/editor';

/** `|` marks the cursor. */
function at(text: string): Editor {
  return {
    value: text.replace('|', ''),
    cursor: text.indexOf('|'),
  };
}
function show(e: Editor | undefined): string | undefined {
  return e && `${e.value.slice(0, e.cursor)}|${e.value.slice(e.cursor)}`;
}

describe('editor', () => {
  it('inserts text and normalizes pasted newlines', () => {
    expect(show(insert(at('ab|c'), 'X'))).toBe('abX|c');
    expect(show(insert(at('|'), 'a\r\nb\rc'))).toBe('a\nb\nc|');
  });

  it('deletes around the cursor', () => {
    expect(show(backspace(at('ab|c')))).toBe('a|c');
    expect(show(backspace(at('|abc')))).toBe('|abc');
    expect(show(deleteForward(at('a|bc')))).toBe('a|c');
  });

  it('works on the current line only', () => {
    expect(show(lineStart(at('one\ntw|o')))).toBe('one\n|two');
    expect(show(lineEnd(at('o|ne\ntwo')))).toBe('one|\ntwo');
    expect(show(killToStart(at('one\ntw|o')))).toBe('one\n|o');
    expect(show(killToEnd(at('o|ne\ntwo')))).toBe('o|\ntwo');
  });

  it('handles words like readline', () => {
    expect(show(killWord(at('vercel logs  |')))).toBe('vercel |');
    expect(show(wordLeft(at('vercel logs|')))).toBe('vercel |logs');
    expect(show(wordRight(at('|vercel logs')))).toBe('vercel| logs');
  });

  it('moves between lines keeping the column', () => {
    expect(show(lineUp(at('abcdef\nab|c')))).toBe('ab|cdef\nabc');
    expect(show(lineUp(at('ab\nabcde|f')))).toBe('ab|\nabcdef');
    expect(lineUp(at('ab|c'))).toBeUndefined();
    expect(show(lineDown(at('abc|def\nab')))).toBe('abcdef\nab|');
    expect(lineDown(at('a\nb|'))).toBeUndefined();
  });

  it('lays out lines with the cursor position', () => {
    expect(layout(at('one\ntw|o'))).toEqual({
      lines: ['one', 'two'],
      row: 1,
      column: 2,
    });
    expect(layout(editorOf(''))).toEqual({
      lines: [''],
      row: 0,
      column: 0,
    });
  });
});
