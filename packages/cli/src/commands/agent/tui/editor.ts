/** A multiline text buffer with a cursor offset into `value`. */
export interface Editor {
  value: string;
  cursor: number;
}

export const emptyEditor: Editor = { value: '', cursor: 0 };

export function editorOf(value: string): Editor {
  return { value, cursor: value.length };
}

export function insert({ value, cursor }: Editor, text: string): Editor {
  const clean = text.replace(/\r\n?/g, '\n');
  return {
    value: value.slice(0, cursor) + clean + value.slice(cursor),
    cursor: cursor + clean.length,
  };
}

function remove(
  { value }: Editor,
  from: number,
  to: number,
  cursor = from
): Editor {
  return { value: value.slice(0, from) + value.slice(to), cursor };
}

export function backspace(e: Editor): Editor {
  return e.cursor ? remove(e, e.cursor - 1, e.cursor) : e;
}
export const deleteForward = (e: Editor): Editor =>
  remove(e, e.cursor, e.cursor + 1);
export function left(e: Editor): Editor {
  return {
    ...e,
    cursor: Math.max(0, e.cursor - 1),
  };
}
export function right(e: Editor): Editor {
  return {
    ...e,
    cursor: Math.min(e.value.length, e.cursor + 1),
  };
}

function lineStartOf(value: string, cursor: number): number {
  return value.lastIndexOf('\n', cursor - 1) + 1;
}

function lineEndOf(value: string, cursor: number): number {
  const end = value.indexOf('\n', cursor);
  return end === -1 ? value.length : end;
}

export function lineStart(e: Editor): Editor {
  return {
    ...e,
    cursor: lineStartOf(e.value, e.cursor),
  };
}
export function lineEnd(e: Editor): Editor {
  return {
    ...e,
    cursor: lineEndOf(e.value, e.cursor),
  };
}
export const killToStart = (e: Editor): Editor =>
  remove(e, lineStartOf(e.value, e.cursor), e.cursor);
export const killToEnd = (e: Editor): Editor =>
  remove(e, e.cursor, lineEndOf(e.value, e.cursor));

/** Start of the word before the cursor, skipping whitespace first (readline `ctrl+w`). */
function wordStartBefore(value: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && /\s/.test(value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(value[i - 1]!)) i--;
  return i;
}

function wordEndAfter(value: string, cursor: number): number {
  let i = cursor;
  while (i < value.length && /\s/.test(value[i]!)) i++;
  while (i < value.length && !/\s/.test(value[i]!)) i++;
  return i;
}

export const killWord = (e: Editor): Editor =>
  remove(e, wordStartBefore(e.value, e.cursor), e.cursor);
export function wordLeft(e: Editor): Editor {
  return {
    ...e,
    cursor: wordStartBefore(e.value, e.cursor),
  };
}
export function wordRight(e: Editor): Editor {
  return {
    ...e,
    cursor: wordEndAfter(e.value, e.cursor),
  };
}

/** Move to the same column on the previous/next line. `undefined` at the first/last line. */
export function lineUp(e: Editor): Editor | undefined {
  const start = lineStartOf(e.value, e.cursor);
  if (start === 0) return undefined;
  const prevStart = lineStartOf(e.value, start - 1);
  return {
    ...e,
    cursor: Math.min(prevStart + (e.cursor - start), start - 1),
  };
}

export function lineDown(e: Editor): Editor | undefined {
  const end = lineEndOf(e.value, e.cursor);
  if (end === e.value.length) return undefined;
  const column = e.cursor - lineStartOf(e.value, e.cursor);
  return {
    ...e,
    cursor: Math.min(end + 1 + column, lineEndOf(e.value, end + 1)),
  };
}

/** Lines of the buffer with the cursor's line and column, for rendering. */
export function layout({ value, cursor }: Editor): {
  lines: string[];
  row: number;
  column: number;
} {
  const before = value.slice(0, cursor).split('\n');
  return {
    lines: value.split('\n'),
    row: before.length - 1,
    column: before.at(-1)!.length,
  };
}
