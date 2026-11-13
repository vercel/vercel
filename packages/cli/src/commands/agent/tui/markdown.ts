import type { Line, Span, Style } from './ui/text';
import { color } from './theme';
import { hang } from './ui/layout';
import { truncate, wrap } from './ui/text';

// `_italic_` only at word boundaries, so snake_case names stay intact.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\b_[^_\n]+_\b)/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

function inline(text: string, base?: Style): Span[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .flatMap((token): Span[] => {
      if (token.startsWith('**') && token.endsWith('**')) {
        return [
          {
            text: token.slice(2, -2),
            style: { ...base, bold: true },
          },
        ];
      }
      if (token.length > 2 && token.startsWith('_') && token.endsWith('_')) {
        return [
          {
            text: token.slice(1, -1),
            style: { ...base, italic: true },
          },
        ];
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return [
          {
            text: token.slice(1, -1),
            style: { ...base, color: color.accent },
          },
        ];
      }
      const link = LINK.exec(token);
      if (link) {
        return [
          { text: `${link[1]} `, style: base },
          {
            text: link[2]!,
            style: { color: color.subtle, underline: true },
          },
        ];
      }
      return [{ text: token, style: base }];
    });
}

/** Inline markers removed, links reduced to their text. */
function plain(text: string): string {
  return inline(text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .map(s => s.text)
    .join('');
}

type Block =
  | { kind: 'code'; lines: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; depth: number; marker: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'text'; text: string };

const TABLE_SEPARATOR = /^[\s:|-]+$/;

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(c => c.trim());
}

function parseLine(line: string): Block {
  const heading = /^#{1,6} (.*)$/.exec(line);
  if (heading) return { kind: 'heading', text: heading[1]! };
  const list = /^( *)([-*+]|\d+[.)]) (.*)$/.exec(line);
  if (list) {
    return {
      kind: 'list',
      depth: Math.floor(list[1]!.length / 2),
      marker: list[2]!,
      text: list[3]!,
    };
  }
  if (line.startsWith('>')) {
    return {
      kind: 'quote',
      text: line.replace(/^> ?/, ''),
    };
  }
  if (/^ {0,3}([-*_])(?: *\1){2,} *$/.test(line)) return { kind: 'rule' };
  return { kind: 'text', text: line };
}

const isFence = (line: string): boolean => line.trimStart().startsWith('```');
const isTableRow = (line: string): boolean => line.trimStart().startsWith('|');

/** Read the block starting at `start`; returns it with the index after it. */
function readBlock(lines: string[], start: number): [Block, number] {
  let i = start;
  if (isFence(lines[i]!)) {
    const code: string[] = [];
    while (++i < lines.length && !isFence(lines[i]!)) code.push(lines[i]!);
    return [{ kind: 'code', lines: code }, i + 1];
  }
  if (isTableRow(lines[i]!)) {
    const rows: string[][] = [];
    for (; i < lines.length && isTableRow(lines[i]!); i++) {
      if (!TABLE_SEPARATOR.test(lines[i]!.trim())) rows.push(cells(lines[i]!));
    }
    return [{ kind: 'table', rows }, i];
  }
  return [parseLine(lines[i]!), i + 1];
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; ) {
    const [block, next] = readBlock(lines, i);
    blocks.push(block);
    i = next;
  }
  return blocks;
}

const TABLE_GAP = 3;
const MIN_COLUMN = 4;

/** Shrink the widest columns until the table fits in `max`. */
function fitWidths(widths: number[], max: number): number[] {
  const fitted = [...widths];
  const total = (): number =>
    fitted.reduce((sum, w) => sum + w, 0) + TABLE_GAP * (fitted.length - 1);
  while (total() > max) {
    const widest = fitted.indexOf(Math.max(...fitted));
    if (fitted[widest]! <= MIN_COLUMN) break;
    fitted[widest]!--;
  }
  return fitted;
}

/** Geist tables: muted header, a divider under it, no vertical rules. Links show their text only. */
function table(source: string[][], max: number): Line[] {
  const rows = source.map(row =>
    row.map(cell => cell.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
  );
  const columns = Math.max(...rows.map(r => r.length));
  const natural = Array.from({ length: columns }, (_, c) =>
    Math.max(...rows.map(r => plain(r[c] ?? '').length))
  );
  const widths = fitWidths(natural, max);
  const lines: Line[] = [];
  rows.forEach((row, r) => {
    const line: Line = [];
    widths.forEach((cellWidth, c) => {
      const cell = row[c] ?? '';
      const base = r === 0 ? { color: color.muted } : undefined;
      const spans =
        plain(cell).length <= cellWidth
          ? inline(cell, base)
          : truncate(
              [
                {
                  text: plain(cell),
                  style: base,
                },
              ],
              cellWidth
            );
      const shown = Math.min(plain(cell).length, cellWidth);
      line.push(...spans);
      if (c < columns - 1) {
        line.push({
          text: ' '.repeat(cellWidth - shown + TABLE_GAP),
        });
      }
    });
    lines.push(line);
    if (r === 0 && rows.length > 1) {
      lines.push([
        {
          text: '─'.repeat(
            widths.reduce((sum, w) => sum + w, 0) + TABLE_GAP * (columns - 1)
          ),
          style: { color: color.border },
        },
      ]);
    }
  });
  return lines;
}

const BULLETS = ['•', '◦', '▪'];

function block(b: Block, width: number): Line[] {
  switch (b.kind) {
    case 'code':
      return b.lines.flatMap(line =>
        hang(
          [
            {
              text: '│ ',
              style: { color: color.border },
            },
          ],
          width,
          w =>
            wrap(
              [
                {
                  text: line,
                  style: { color: color.accent },
                },
              ],
              w
            )
        )
      );
    case 'table':
      return table(b.rows, width);
    case 'heading':
      return wrap(inline(b.text, { bold: true, underline: true }), width);
    case 'list': {
      const marker = /\d/.test(b.marker)
        ? b.marker
        : BULLETS[b.depth % BULLETS.length]!;
      return hang(
        [{ text: `${' '.repeat(b.depth * 2)}${marker} ` }],
        width,
        w => wrap(inline(b.text), w)
      );
    }
    case 'quote':
      return hang(
        [
          {
            text: '▎ ',
            style: { color: color.muted },
          },
        ],
        width,
        w => wrap(inline(b.text, { color: color.muted, italic: true }), w)
      );
    case 'rule':
      return [
        [
          {
            text: '─'.repeat(Math.min(40, width)),
            style: { color: color.border },
          },
        ],
      ];
    case 'text':
      return b.text ? wrap(inline(b.text), width) : [[]];
  }
}

/** Markdown for agent answers: headings, lists, tables, quotes, code blocks and inline styles. */
export function renderMarkdown(text: string, width: number): Line[] {
  return parseBlocks(text).flatMap(b => block(b, width));
}
