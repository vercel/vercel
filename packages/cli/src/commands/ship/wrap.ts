import stripAnsi from 'strip-ansi';

/** Matches one ANSI escape sequence. */
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * SGR codes that close others, mapped to the codes they close.
 *
 * Chalk emits paired codes: bold opens with 1 and closes with 22, cyan opens
 * with 36 and closes with 39. Tracking the pairs is what lets a style that
 * spans a wrap point be reopened on the next line instead of being lost.
 */
const CLOSERS: Record<string, (code: string) => boolean> = {
  '22': code => code === '1' || code === '2',
  '23': code => code === '3',
  '24': code => code === '4',
  '27': code => code === '7',
  '29': code => code === '9',
  '39': code => isForeground(code),
  '49': code => isBackground(code),
};

function isForeground(code: string): boolean {
  const value = Number(code);
  return (value >= 30 && value <= 38) || (value >= 90 && value <= 97);
}

function isBackground(code: string): boolean {
  const value = Number(code);
  return (value >= 40 && value <= 48) || (value >= 100 && value <= 107);
}

const RESET = '\x1b[0m';

/**
 * Wrap styled text to a width, indenting every line after the first.
 *
 * Wrapping has to happen after styling, because styling is what the renderer
 * produces, and it has to be ANSI-aware, because escape sequences occupy no
 * columns. Wrapping the raw text first is not an option either: it would split
 * inline markup that spans the break.
 *
 * Words longer than the width are left alone rather than broken. They are URLs
 * and file paths, which are worth more intact than aligned.
 */
export function wrapAnsi(
  text: string,
  width: number,
  hangingIndent = ''
): string[] {
  if (width <= 0 || !text) {
    return [text];
  }

  // Leading whitespace is structure: the indentation of a nested list item or
  // a line of code. Splitting on spaces would swallow it, so it is taken off
  // the front and reapplied to every line, with the caller's hanging indent on
  // top for continuations.
  const leading = /^((?:\x1b\[[0-9;]*m)*)([ \t]+)/.exec(text);
  const indent = leading ? leading[2] : '';
  const body = leading ? leading[1] + text.slice(leading[0].length) : text;

  const firstPrefix = indent;
  const restPrefix = indent + hangingIndent;
  const firstWidth = Math.max(1, width - firstPrefix.length);
  const restWidth = Math.max(1, width - restPrefix.length);

  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  let open: string[] = [];

  const flush = () => {
    const prefix = lines.length === 0 ? firstPrefix : restPrefix;
    const carry = open.length > 0 ? RESET : '';
    lines.push(prefix + current + carry);
  };

  // Split on spaces only. A styled span keeps its escape sequences attached to
  // the word they decorate, so a word is always self-contained apart from
  // styles that continue past it.
  for (const word of body.split(' ')) {
    const wordWidth = stripAnsi(word).length;
    const limit = lines.length === 0 ? firstWidth : restWidth;

    if (current !== '' && currentWidth + 1 + wordWidth > limit) {
      flush();
      current = reopen(open);
      currentWidth = 0;
    } else if (current !== '') {
      current += ' ';
      currentWidth += 1;
    }

    current += word;
    currentWidth += wordWidth;
    open = track(open, word);
  }

  flush();
  return lines;
}

/** Update the set of styles left open after consuming a word. */
function track(open: string[], word: string): string[] {
  let result = open;

  for (const sequence of word.match(ANSI) ?? []) {
    for (const code of sequence.slice(2, -1).split(';')) {
      if (code === '' || code === '0') {
        result = [];
        continue;
      }

      const closes = CLOSERS[code];
      if (closes) {
        result = result.filter(entry => !closes(entry));
        continue;
      }

      result = [...result, code];
    }
  }

  return result;
}

/** The escape sequence that restores a set of open codes. */
function reopen(open: string[]): string {
  return open.length > 0 ? `\x1b[${open.join(';')}m` : '';
}

/** Width available for text, given a gutter, with a sane floor and ceiling. */
export function textWidth(gutterWidth: number): number {
  const columns = process.stderr.columns || 80;
  // Long measures are hard to read; 100 columns of prose is about the limit.
  return Math.max(40, Math.min(columns, 100) - gutterWidth);
}

/**
 * Cut styled text to a width, ending it with an ellipsis if anything was lost.
 *
 * For lines that must stay on one line: a shell command, a line of code. A
 * wrapped command is harder to read than a truncated one, because the shape of
 * the command is the thing being scanned for.
 */
export function truncateAnsi(text: string, width: number): string {
  if (width <= 1 || stripAnsi(text).length <= width) {
    return text;
  }

  let visible = 0;
  let result = '';
  let index = 0;
  let styled = false;

  while (index < text.length && visible < width - 1) {
    const sequence = /^\x1b\[[0-9;]*m/.exec(text.slice(index));
    if (sequence) {
      result += sequence[0];
      index += sequence[0].length;
      styled = true;
      continue;
    }
    result += text[index];
    index += 1;
    visible += 1;
  }

  // Only reset when something was actually opened. Appending it unconditionally
  // writes an escape into output that has none, which shows up verbatim the
  // moment the stream is not a terminal.
  return `${result}\u2026${styled ? RESET : ''}`;
}
