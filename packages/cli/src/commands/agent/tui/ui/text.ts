import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';

/**
 * Styled text as data. Components build lines of spans; wrapping and truncation work on spans,
 * and ANSI codes appear only when a line is written (`toAnsi`).
 */
export interface Style {
  /** An ANSI color name (`blue`, `gray`…) or `#rrggbb`. */
  color?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
}

export interface Span {
  text: string;
  style?: Style;
}

export type Line = Span[];

/** Display width in terminal cells. */
function width(text: string): number {
  return stringWidth(text);
}

export function lineWidth(line: Line): number {
  return line.reduce((sum, s) => sum + width(s.text), 0);
}

export function plainText(line: Line): string {
  return line.map(s => s.text).join('');
}

/** Remove terminal control sequences from untrusted text (tool output) and expand tabs. */
export function sanitize(text: string): string {
  return stripVTControlCharacters(text).replace(/\t/g, '  ').replace(/\r/g, '');
}

const segmenter = new Intl.Segmenter();

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), s => s.segment);
}

/** Cut a line to `max` cells, ending with `…` when it was longer. */
export function truncate(line: Line, max: number): Line {
  if (lineWidth(line) <= max) return line;
  const out: Line = [];
  let used = 0;
  for (const s of line) {
    let text = '';
    for (const g of graphemes(s.text)) {
      const w = width(g);
      if (used + w > max - 1) break;
      text += g;
      used += w;
    }
    if (text) out.push({ text, style: s.style });
    if (used >= max - 1 || text.length < s.text.length) break;
  }
  out.push({ text: '…', style: line.at(-1)?.style });
  return out;
}

/** Pad a line with spaces to exactly `cells` wide (it must not be wider). */
export function pad(line: Line, cells: number): Line {
  const missing = cells - lineWidth(line);
  return missing > 0
    ? [
        ...line,
        {
          text: ' '.repeat(missing),
        },
      ]
    : line;
}

interface Token {
  text: string;
  style?: Style;
  space: boolean;
}

function tokenize(line: Line): Token[] {
  const tokens: Token[] = [];
  for (const s of line) {
    for (const part of s.text.split(/(\s+)/)) {
      if (part) {
        tokens.push({
          text: part,
          style: s.style,
          space: /^\s+$/.test(part),
        });
      }
    }
  }
  return tokens;
}

/** Append text to a line, merging into the last span when the style is the same. */
function append(line: Line, text: string, style?: Style): void {
  const last = line.at(-1);
  if (last && last.style === style) last.text += text;
  else line.push({ text, style });
}

/**
 * Word-wrap one logical line to `max` cells. Words longer than a line are broken; spaces at a
 * break are dropped. Newlines inside spans start new lines.
 */
export function wrap(line: Line, max: number): Line[] {
  const logical: Line[] = [[]];
  for (const s of line) {
    s.text.split('\n').forEach((part, i) => {
      if (i > 0) logical.push([]);
      if (part) logical.at(-1)!.push({ text: part, style: s.style });
    });
  }
  return logical.flatMap(l => wrapOne(l, Math.max(1, max)));
}

/** Lay out word-wrapped rows: `rows` grows as text no longer fits on the current row. */
class Rows {
  rows: Line[] = [[]];
  used = 0;

  constructor(private max: number) {}

  private newRow(): void {
    const last = this.rows.at(-1)!.at(-1);
    if (last) last.text = last.text.replace(/\s+$/, '');
    this.rows.push([]);
    this.used = 0;
  }

  space(token: Token): void {
    const w = width(token.text);
    if (this.used > 0 && this.used + w <= this.max) {
      append(this.rows.at(-1)!, token.text, token.style);
      this.used += w;
    }
  }

  word(token: Token): void {
    const w = width(token.text);
    if (this.used + w > this.max && this.used > 0) this.newRow();
    if (w <= this.max) {
      append(this.rows.at(-1)!, token.text, token.style);
      this.used += w;
      return;
    }
    // Longer than a whole row: break it between characters.
    for (const g of graphemes(token.text)) {
      const gw = width(g);
      if (this.used + gw > this.max) {
        this.rows.push([]);
        this.used = 0;
      }
      append(this.rows.at(-1)!, g, token.style);
      this.used += gw;
    }
  }
}

function wrapOne(line: Line, max: number): Line[] {
  const rows = new Rows(max);
  for (const token of tokenize(line)) {
    if (token.space) rows.space(token);
    else rows.word(token);
  }
  return rows.rows;
}

/** Break a line into rows of at most `max` cells, keeping every character (for editable text). */
export function hardWrap(line: Line, max: number): Line[] {
  const rows: Line[] = [[]];
  let used = 0;
  for (const s of line) {
    for (const g of graphemes(s.text)) {
      const w = width(g);
      if (used + w > max && used > 0) {
        rows.push([]);
        used = 0;
      }
      append(rows.at(-1)!, g, s.style);
      used += w;
    }
  }
  return rows;
}

/** 0: no color (attributes only), 1: 16 colors, 2: 256 colors, 3: truecolor. */
let colorDepth = 1;

export function setColorDepth(depth: number): void {
  colorDepth = depth;
}

export function detectColorDepth(
  env: Record<string, string | undefined>,
  isTTY: boolean
): number {
  if (env.FORCE_COLOR !== undefined) {
    return Math.min(
      3,
      Number(env.FORCE_COLOR) || (env.FORCE_COLOR === '' ? 1 : 0)
    );
  }
  if (env.NO_COLOR || env.TERM === 'dumb' || !isTTY) return 0;
  if (/^(?:truecolor|24bit)$/i.test(env.COLORTERM ?? '')) return 3;
  return /256|direct|kitty|ghostty/.test(env.TERM ?? '') ? 2 : 1;
}

const NAMED: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  grey: 90,
};

/** The nearest xterm-256 color: the gray ramp for grays, the 6×6×6 cube otherwise. */
function ansi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const level = (v: number): number => Math.round((v / 255) * 5);
  return 16 + 36 * level(r) + 6 * level(g) + level(b);
}

function colorCode(color: string): string {
  if (!color.startsWith('#')) return String(NAMED[color] ?? 39);
  const [r, g, b] = [1, 3, 5].map(i =>
    Number.parseInt(color.slice(i, i + 2), 16)
  ) as [number, number, number];
  if (colorDepth >= 3) return `38;2;${r};${g};${b}`;
  if (colorDepth === 2) return `38;5;${ansi256(r, g, b)}`;
  return '90';
}

function sgr(style: Style): string {
  const codes: string[] = [];
  if (style.bold) codes.push('1');
  if (style.dim) codes.push('2');
  if (style.italic) codes.push('3');
  if (style.underline) codes.push('4');
  if (style.inverse) codes.push('7');
  if (style.strikethrough) codes.push('9');
  // NO_COLOR drops colors, not attributes: the drawn cursor (inverse) must stay visible.
  if (style.color && colorDepth > 0) codes.push(colorCode(style.color));
  return codes.length ? `\u001B[${codes.join(';')}m` : '';
}

/** A line as terminal output. Every styled span resets after itself, so styles never leak. */
export function toAnsi(line: Line): string {
  return line
    .map(s => {
      const open = s.style ? sgr(s.style) : '';
      return open ? `${open}${s.text}\u001B[0m` : s.text;
    })
    .join('');
}
