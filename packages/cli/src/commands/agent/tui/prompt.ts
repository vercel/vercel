import type { Editor } from './editor';
import type { KeyEvent } from './ui/keys';
import type { Line } from './ui/text';
import {
  backspace,
  deleteForward,
  editorOf,
  emptyEditor,
  insert,
  killToEnd,
  killToStart,
  killWord,
  layout,
  left,
  lineDown,
  lineEnd,
  lineStart,
  lineUp,
  right,
  wordLeft,
  wordRight,
} from './editor';
import { color, glyph } from './theme';
import { hardWrap } from './ui/text';

/** Emacs-style editing keys (readline), with `ctrl`. */
const CTRL_KEYS: Record<string, (e: Editor) => Editor> = {
  a: lineStart,
  e: lineEnd,
  b: left,
  f: right,
  u: killToStart,
  k: killToEnd,
  w: killWord,
};

/** With `meta` (Option/Alt). */
const META_KEYS: Record<string, (e: Editor) => Editor> = {
  b: wordLeft,
  f: wordRight,
};

function arrowKey(editor: Editor, event: KeyEvent): Editor | undefined {
  const word = event.meta || event.ctrl;
  switch (event.name) {
    case 'left':
      return word ? wordLeft(editor) : left(editor);
    case 'right':
      return word ? wordRight(editor) : right(editor);
    case 'home':
      return lineStart(editor);
    case 'end':
      return lineEnd(editor);
  }
}

/** Apply a key that only edits the buffer. `undefined` when the key is not an edit. */
function editKey(editor: Editor, event: KeyEvent): Editor | undefined {
  if (event.name === 'backspace') {
    return event.meta ? killWord(editor) : backspace(editor);
  }
  if (event.name === 'delete') return deleteForward(editor);
  const arrow = arrowKey(editor, event);
  if (arrow) return arrow;
  if (event.name !== 'char') return undefined;
  const text = event.text ?? '';
  if (event.ctrl) {
    return text === 'd' && editor.value
      ? deleteForward(editor)
      : CTRL_KEYS[text]?.(editor);
  }
  if (event.meta) return META_KEYS[text]?.(editor);
  return insert(editor, text);
}

/** A multiline prompt like Claude Code's: Enter sends; Shift+Enter, Option+Enter or `\`+Enter adds a line. */
export class PromptEditor {
  editor: Editor = emptyEditor;
  /** Past prompts, oldest first. Up/Down on the first/last line walks them. */
  history: string[] = [];
  /** Position in `history` while browsing it, and the draft to return to. */
  private browsing: { index: number; draft: string } | null = null;

  constructor(private onSubmit: (text: string) => void) {}

  set(editor: Editor): void {
    this.editor = editor;
  }

  clear(): void {
    this.editor = emptyEditor;
    this.browsing = null;
  }

  private browse(direction: -1 | 1): void {
    const current = this.browsing ?? {
      index: this.history.length,
      draft: this.editor.value,
    };
    const index = Math.min(
      this.history.length,
      Math.max(0, current.index + direction)
    );
    if (index === current.index) return;
    this.browsing =
      index === this.history.length ? null : { index, draft: current.draft };
    this.editor = editorOf(
      index === this.history.length ? current.draft : this.history[index]!
    );
  }

  paste(text: string): void {
    this.editor = insert(this.editor, text);
  }

  /** Returns `false` for keys the editor does not use. */
  handleKey(event: KeyEvent): boolean {
    const { editor } = this;
    if (event.name === 'return') {
      if (event.shift || event.meta) this.editor = insert(editor, '\n');
      else if (editor.value[editor.cursor - 1] === '\\')
        this.editor = insert(backspace(editor), '\n');
      else this.onSubmit(editor.value);
      return true;
    }
    if (event.name === 'up' || event.name === 'down') {
      const moved = event.name === 'up' ? lineUp(editor) : lineDown(editor);
      if (moved) {
        this.editor = moved;
      } else {
        this.browse(event.name === 'up' ? -1 : 1);
      }
      return true;
    }
    const next = editKey(editor, event);
    if (next) this.editor = next;
    return Boolean(next);
  }

  /** The buffer with a drawn cursor, wrapped to `width`, or the placeholder when empty. */
  view(width: number, placeholder: string): Line[] {
    const prefix = (i: number): Line[number] => ({
      text: i === 0 ? `${glyph.prompt} ` : '  ',
      style: { color: color.muted },
    });
    if (!this.editor.value) {
      return [
        [
          prefix(0),
          {
            text: placeholder[0] ?? ' ',
            style: { inverse: true },
          },
          {
            text: placeholder.slice(1),
            style: { color: color.subtle },
          },
        ],
      ];
    }
    const { lines, row, column } = layout(this.editor);
    return lines.flatMap((line, i) => {
      const spans: Line =
        i === row
          ? [
              {
                text: line.slice(0, column),
              },
              {
                text: line[column] ?? ' ',
                style: { inverse: true },
              },
              {
                text: line.slice(column + 1),
              },
            ]
          : [{ text: line }];
      return hardWrap(
        spans.filter(s => s.text),
        Math.max(1, width - 2)
      ).map((wrapped, j) => [prefix(i + j), ...wrapped]);
    });
  }
}
