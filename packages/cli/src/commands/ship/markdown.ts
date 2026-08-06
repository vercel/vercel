import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import sharedTable from '../../util/output/table';
import { truncateAnsi } from './wrap';

/**
 * Line-at-a-time markdown styling for streamed agent output.
 *
 * A parser such as `marked` needs the whole document before it can render, which
 * would mean buffering a multi-minute agent response and printing it only at the
 * end — losing the live progress that makes a long session tolerable. Styling one
 * completed line at a time streams naturally and needs no dependency beyond
 * `chalk`, which the CLI already ships.
 *
 * The trade is fidelity: this is a styler, not a parser. It covers what agent
 * prose actually contains and deliberately leaves anything structural — tables,
 * nested constructs — as written.
 */
export class MarkdownStyler {
  /** Inside a fenced code block, where markdown syntax must be left alone. */
  private inFence = false;

  /**
   * Whether the last line styled was preformatted, so a caller knows not to
   * reflow it. Set by `line()`, because a fence delimiter toggles the state
   * partway through styling the line that carries it.
   */
  private wasPreformatted = false;

  get preformatted(): boolean {
    return this.wasPreformatted;
  }

  /**
   * Extra indent that continuation lines of the last styled line need, so a
   * wrapped list item aligns under its own text instead of under its marker.
   */
  private continuation = '';

  get hangingIndent(): string {
    return this.continuation;
  }

  /** Style one complete line. Newlines must not be included. */
  line(raw: string): string {
    const fence = raw.trimStart();
    this.wasPreformatted = this.inFence;
    this.continuation = '';

    // Fence delimiters toggle raw mode and are shown as a subtle rule so the
    // block still reads as a block.
    if (fence.startsWith('```') || fence.startsWith('~~~')) {
      this.inFence = !this.inFence;
      const language = fence.slice(3).trim();
      // Label the opening fence with its language; the closing fence becomes a
      // blank line rather than a line of trailing whitespace.
      return this.inFence && language ? chalk.dim(`  ${language}`) : '';
    }

    if (this.inFence) {
      return chalk.dim(`  ${raw}`);
    }

    if (raw.trim() === '') {
      return '';
    }

    return this.block(raw);
  }

  /** Reset between turns so an unterminated fence cannot leak. */
  reset(): void {
    this.inFence = false;
    this.wasPreformatted = false;
    this.continuation = '';
  }

  private block(raw: string): string {
    const indent = raw.slice(0, raw.length - raw.trimStart().length);
    const text = raw.trimStart();

    // Horizontal rule.
    if (/^([-*_])\1{2,}\s*$/.test(text)) {
      return chalk.dim('  ─────────────────────────────');
    }

    // ATX heading. Level drives weight rather than colour, so headings stay
    // legible on both light and dark terminals.
    const heading = text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2].replace(/\s+#+\s*$/, ''));
      // Not `bold.dim` for deeper levels: bold and dim share ANSI reset 22, so
      // combining them renders inconsistently across terminals.
      return level === 1 ? chalk.bold.underline(content) : chalk.bold(content);
    }

    // Blockquote, rendered with a gutter instead of a stray `>`. The gutter
    // carries the signal, so the body keeps normal inline styling rather than
    // being wrapped in `dim` — nesting bold inside dim would reset the dim.
    const quote = text.match(/^>\s?(.*)$/);
    if (quote) {
      this.continuation = '  ';
      return `${indent}${chalk.dim('│')} ${inline(quote[1])}`;
    }

    // Task list, checked before plain bullets so the marker is not eaten.
    const task = text.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const done = task[1].toLowerCase() === 'x';
      const box = done ? chalk.green('✓') : chalk.dim('○');
      const label = done ? chalk.dim(inline(task[2])) : inline(task[2]);
      this.continuation = '  ';
      return `${indent}${box} ${label}`;
    }

    // Unordered list.
    const bullet = text.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      this.continuation = '  ';
      return `${indent}${chalk.dim('•')} ${inline(bullet[1])}`;
    }

    // Ordered list.
    const ordered = text.match(/^(\d+)([.)])\s+(.*)$/);
    if (ordered) {
      this.continuation = ' '.repeat(ordered[1].length + 2);
      return `${indent}${chalk.dim(`${ordered[1]}.`)} ${inline(ordered[3])}`;
    }

    return indent + inline(text);
  }
}

/**
 * Apply inline styling.
 *
 * Code spans are split out first so emphasis markers inside them are preserved —
 * the usual failure mode of regex-based markdown styling.
 */
export function inline(text: string): string {
  return text
    .split(/(`+[^`]+`+)/g)
    .map(part => {
      const code = part.match(/^(`+)([^`]+)\1$/);
      return code ? chalk.cyan(code[2]) : emphasis(part);
    })
    .join('');
}

/**
 * Inline markdown reduced to plain text — markers removed, nothing styled.
 *
 * For text that lands inside an already-styled span (a `chalk.dim` option
 * description, a prompt message the prompt styles itself): nesting bold inside
 * dim breaks, because bold and dim share ANSI reset 22, so the markers are
 * stripped instead of translated.
 */
export function plainInline(text: string): string {
  return text
    .split(/(`+[^`]+`+)/g)
    .map(part => {
      const code = part.match(/^(`+)([^`]+)\1$/);
      if (code) return code[2];
      return part
        .replace(
          /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
          (_, label: string, url: string) => label || url
        )
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/___([^_]+)___/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(^|[\s([{])\*([^*\s][^*]*)\*(?=$|[\s)\]}.,;:!?])/g, '$1$2')
        .replace(/(^|[\s([{])_([^_\s][^_]*)_(?=$|[\s)\]}.,;:!?])/g, '$1$2')
        .replace(/~~([^~]+)~~/g, '$1');
    })
    .join('');
}

function emphasis(text: string): string {
  return (
    text
      // Links: keep the label readable and demote the URL.
      .replace(
        /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
        (_, label: string, url: string) =>
          label ? `${chalk.cyan.underline(label)} ${chalk.dim(url)}` : url
      )
      .replace(/\*\*\*([^*]+)\*\*\*/g, (_, t: string) => chalk.bold.italic(t))
      .replace(/___([^_]+)___/g, (_, t: string) => chalk.bold.italic(t))
      .replace(/\*\*([^*]+)\*\*/g, (_, t: string) => chalk.bold(t))
      .replace(/__([^_]+)__/g, (_, t: string) => chalk.bold(t))
      // Single-character emphasis, guarded so `a*b*c` and snake_case are left
      // alone.
      .replace(
        /(^|[\s([{])\*([^*\s][^*]*)\*(?=$|[\s)\]}.,;:!?])/g,
        (_, before: string, t: string) => `${before}${chalk.italic(t)}`
      )
      .replace(
        /(^|[\s([{])_([^_\s][^_]*)_(?=$|[\s)\]}.,;:!?])/g,
        (_, before: string, t: string) => `${before}${chalk.italic(t)}`
      )
      .replace(/~~([^~]+)~~/g, (_, t: string) => chalk.strikethrough(t))
  );
}

/** A markdown table row: starts with an optional indent then a pipe. */
export function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

/** The `|---|:--:|` row that makes the block above it a header. */
function isSeparatorRow(line: string): boolean {
  const cells = splitRow(line);
  return (
    cells.length > 0 && cells.every(cell => /^:?-{1,}:?$/.test(cell.trim()))
  );
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}

/** `:--` / `--:` / `:-:` in the separator row set column alignment. */
function alignmentOf(cell: string): 'l' | 'c' | 'r' {
  const value = cell.trim();
  if (value.startsWith(':') && value.endsWith(':')) return 'c';
  if (value.endsWith(':')) return 'r';
  return 'l';
}

/**
 * Render a buffered markdown table as aligned terminal output.
 *
 * A table is the one construct that cannot be styled a line at a time, since
 * column widths depend on every row. It is also self-delimiting: the block ends
 * at the first line that is not a row, so buffering it costs a handful of lines
 * rather than the whole document, and streaming everything else is unaffected.
 *
 * Falls back to returning the rows unchanged when the block has no separator
 * row, because that is pipe-delimited prose rather than a table.
 */
export function renderTable(lines: string[], maxWidth = Infinity): string[] {
  const rows = lines.filter(line => line.trim() !== '');
  if (rows.length === 0) return [];

  const separatorIndex = rows.findIndex(isSeparatorRow);
  if (separatorIndex < 1) {
    return rows.map(line => chalk.dim(line));
  }

  const head = splitRow(rows[separatorIndex - 1]).map(cell =>
    chalk.bold(inline(cell))
  );
  const align = splitRow(rows[separatorIndex]).map(alignmentOf);

  // Pad or trim every row to the header width so a ragged row cannot throw the
  // column count off.
  const body = rows
    .filter(
      (_, index) => index !== separatorIndex && index !== separatorIndex - 1
    )
    .map(splitRow)
    .map(cells =>
      Array.from({ length: head.length }, (_, i) => inline(cells[i] ?? ''))
    );

  // Borderless, matching the tables the rest of the CLI prints, with a single
  // rule under the header instead of a full box.
  const rendered = sharedTable([head, ...body], { align, hsep: 3 }).split('\n');
  const width = Math.min(
    Math.max(...rendered.map(line => stripAnsi(line).length)),
    maxWidth
  );
  const rule = chalk.dim('─'.repeat(Math.max(1, width)));

  // A wrapped cell destroys the grid, so an over-wide table is cut rather than
  // reflowed. The full text is still in the agent's own transcript.
  return [rendered[0], rule, ...rendered.slice(1)].map(
    line => `  ${truncateAnsi(line, maxWidth - 2)}`
  );
}
