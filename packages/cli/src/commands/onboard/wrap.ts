import { eastAsianWidth } from 'get-east-asian-width';

/** Matches one ANSI escape sequence. */
const ANSI = /\x1b\[[0-9;]*m/g;

/** Matches an ANSI escape sequence anchored at the start of a string. */
const ANSI_AT_START = /^\x1b\[[0-9;]*m/;

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
 * Splits text into user-perceived characters.
 *
 * A grapheme is the unit a terminal draws in a cell: an emoji built from
 * several code points, a letter followed by a combining accent, a flag made of
 * two regional indicators. Counting code points instead would over-measure all
 * of them and leave the text column ragged.
 */
let segmenter: Intl.Segmenter | undefined;

function graphemes(text: string): string[] {
  segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(text)].map(entry => entry.segment);
}

/** Code points that occupy no cell of their own. */
function isZeroWidth(codePoint: number): boolean {
  return (
    // Combining marks, which render on top of the character before them.
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    // Variation selectors, and the zero-width joiner that builds emoji.
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    codePoint === 0x200d ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    // C0 controls other than tab, which never take a column here.
    (codePoint < 0x20 && codePoint !== 0x09)
  );
}

/**
 * Columns a string occupies in a terminal.
 *
 * Escape sequences are free, a CJK ideograph or an emoji takes two columns, and
 * a combining mark takes none. Measuring by string length instead is correct
 * only for ASCII, and every place a width is used here is a place where being
 * wrong shifts the text column for the rest of the line.
 */
export function visibleWidth(text: string): number {
  let width = 0;

  for (const grapheme of graphemes(text.replace(ANSI, ''))) {
    // The first code point decides the width of the cluster; the rest are
    // modifiers rendered into the same cell.
    const codePoint = grapheme.codePointAt(0);
    if (codePoint === undefined || isZeroWidth(codePoint)) {
      continue;
    }
    width += eastAsianWidth(codePoint);
  }

  return width;
}

/**
 * Whether a word too long for the line may be broken inside.
 *
 * A run of wide characters is breakable: CJK is written without spaces, so a
 * line of it is one word that would otherwise overflow every line, and a run of
 * emoji is the same shape. Anything else too long to fit is a URL or a path,
 * which is worth more intact than aligned.
 *
 * Width is the test rather than a list of ranges, because "wide" is exactly the
 * property that makes a script space-free, and the width table already knows
 * which characters have it.
 */
function isBreakable(word: string): boolean {
  return graphemes(word.replace(ANSI, '')).some(
    grapheme => visibleWidth(grapheme) > 1
  );
}

/**
 * Wrap styled text to a width, indenting every line after the first.
 *
 * Wrapping has to happen after styling, because styling is what the renderer
 * produces, and it has to be ANSI-aware, because escape sequences occupy no
 * columns. Wrapping the raw text first is not an option either: it would split
 * inline markup that spans the break.
 *
 * A word longer than the width is left alone when it is unbreakable, such as a
 * URL or a file path, which are worth more intact than aligned, and broken when
 * it is a run of CJK, which has no spaces to break at.
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
  const firstWidth = Math.max(1, width - visibleWidth(firstPrefix));
  const restWidth = Math.max(1, width - visibleWidth(restPrefix));

  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  let open: string[] = [];

  const limit = () => (lines.length === 0 ? firstWidth : restWidth);

  const flush = () => {
    const prefix = lines.length === 0 ? firstPrefix : restPrefix;
    lines.push(prefix + current + (open.length > 0 ? RESET : ''));
    current = reopen(open);
    currentWidth = 0;
  };

  // Split on spaces only. A styled span keeps its escape sequences attached to
  // the word they decorate, so a word is always self-contained apart from
  // styles that continue past it.
  for (const word of body.split(' ')) {
    const wordWidth = visibleWidth(word);

    if (current !== '' && currentWidth + 1 + wordWidth > limit()) {
      flush();
    } else if (current !== '') {
      current += ' ';
      currentWidth += 1;
    }

    if (wordWidth <= limit() || !isBreakable(word)) {
      current += word;
      currentWidth += wordWidth;
      open = track(open, word);
      continue;
    }

    // Breakable and too long: fill by grapheme, wrapping as it goes.
    for (const grapheme of graphemes(word)) {
      if (ANSI_AT_START.test(grapheme)) {
        current += grapheme;
        open = track(open, grapheme);
        continue;
      }

      const graphemeWidth = visibleWidth(grapheme);
      if (currentWidth + graphemeWidth > limit() && currentWidth > 0) {
        flush();
      }
      current += grapheme;
      currentWidth += graphemeWidth;
      open = track(open, grapheme);
    }
  }

  const prefix = lines.length === 0 ? firstPrefix : restPrefix;
  lines.push(prefix + current + (open.length > 0 ? RESET : ''));
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
  if (width <= 1 || visibleWidth(text) <= width) {
    return text;
  }

  let visible = 0;
  let result = '';
  let index = 0;
  let styled = false;

  // By grapheme, so a cut never lands inside an emoji or between a letter and
  // its accent, and never spends half a cell on a wide character.
  while (index < text.length) {
    const sequence = ANSI_AT_START.exec(text.slice(index));
    if (sequence) {
      result += sequence[0];
      index += sequence[0].length;
      styled = true;
      continue;
    }

    const [grapheme = text[index]] = graphemes(text.slice(index));
    const graphemeWidth = visibleWidth(grapheme);
    if (visible + graphemeWidth > width - 1) {
      break;
    }

    result += grapheme;
    index += grapheme.length;
    visible += graphemeWidth;
  }

  // Only reset when something was actually opened. Appending it unconditionally
  // writes an escape into output that has none, which shows up verbatim the
  // moment the stream is not a terminal.
  return `${result}\u2026${styled ? RESET : ''}`;
}
