import chalk from 'chalk';
import {
  MAX_TREE_DEPTH,
  SPAN_STATUS_ERROR,
  analyze,
  getStartTimeUs,
  readAttrString,
} from './analyze';
import {
  collectAttrHints,
  formatDurationUs,
  formatPct,
} from './render-markdown';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import ellipsis from '../../util/output/ellipsis';
import type { AnalyzedTrace, Span, TreeNode } from './types';

const UNNAMED = '<unnamed>';
const DEFAULT_COLUMNS = 100;
const MIN_COLUMNS = 60;
const MAX_COLUMNS = 160;
const MIN_NAME_WIDTH = 16;
const DURATION_WIDTH = 8;
const MIN_BAR_WIDTH = 16;
const MAX_SHARE_BAR_WIDTH = 24;
const HINT_KEY_WIDTH = 18;
const GAP = '  ';
const GUTTER = '  ';
const FULL_BLOCK = '█';
// Left-aligned partial blocks, indexed by eighths of a cell (0 = empty).
const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const;

type Layout = {
  nameWidth: number;
  barWidth: number;
};

/**
 * One chart row. Sibling spans that share a name collapse into a single row
 * so traces with hundreds of repeated calls stay readable; their children
 * merge the same way, one level down.
 */
export type ChartRow = {
  name: string;
  depth: number;
  spans: Span[];
};

/**
 * Renders a trace as a terminal waterfall chart: a summary block, errors,
 * repeated operations, and one bar per span positioned on a shared timeline.
 * Used for TTY output; piped and agent output keeps the markdown summary.
 */
export function renderWaterfall(
  trace: Parameters<typeof analyze>[0],
  options: { requestId: string; columns?: number }
): string {
  const analysis = analyze(trace);
  const columns = clamp(
    options.columns || DEFAULT_COLUMNS,
    MIN_COLUMNS,
    MAX_COLUMNS
  );
  const sections: string[] = [renderSummary(analysis, options.requestId)];
  if (analysis.errorSpans.length > 0) {
    sections.push(renderErrors(analysis));
  }
  if (analysis.repeatedOps.length > 0) {
    sections.push(renderRepeatedOps(analysis, columns));
  }
  sections.push(renderChart(analysis, columns));
  return `${sections.join('\n\n')}\n`;
}

function renderSummary(analysis: AnalyzedTrace, requestId: string): string {
  const { trace, root, rootDurationUs, errorSpans } = analysis;
  const method = readAttrString(root?.attributes, 'http.method');
  const target = readAttrString(root?.attributes, 'http.target');
  const status = readAttrString(root?.attributes, 'http.status_code');
  const path = method && target ? `${method} ${target}` : (method ?? target);

  const rows = [
    formatAlignedLabel('Trace', trace.traceId),
    formatAlignedLabel('Request', requestId),
  ];
  if (path) {
    rows.push(
      formatAlignedLabel('Endpoint', status ? `${path} → ${status}` : path)
    );
  }
  rows.push(formatAlignedLabel('Duration', formatDurationUs(rootDurationUs)));
  const errorCount = errorSpans.length;
  const spans =
    errorCount === 0
      ? String(trace.spans.length)
      : `${trace.spans.length} · ${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`;
  rows.push(formatAlignedLabel('Spans', spans));
  return rows.join('\n');
}

function renderErrors(analysis: AnalyzedTrace): string {
  const lines = [`${GUTTER}${chalk.bold('Errors')}`];
  for (const span of analysis.errorSpans) {
    const name = span.name || UNNAMED;
    const message = span.status?.message;
    lines.push(
      `${chalk.red('✗')} ${name}${message ? chalk.dim(` · ${message}`) : ''}`
    );
    for (const hint of collectAttrHints(span.attributes)) {
      const key = chalk.dim(hint.key.padEnd(HINT_KEY_WIDTH));
      lines.push(`${GUTTER}  ${key}${hint.value}`);
    }
  }
  return lines.join('\n');
}

function renderRepeatedOps(analysis: AnalyzedTrace, columns: number): string {
  const { repeatedOps, rootDurationUs } = analysis;
  const hasRoot = rootDurationUs !== null && rootDurationUs > 0;
  const rows = repeatedOps.map(op => ({
    name: op.name,
    count: `${op.count}×`,
    total: formatDurationUs(op.totalUs),
    perCall: `${formatDurationUs(op.perCallUs)} each`,
    share: hasRoot ? op.totalUs / (rootDurationUs as number) : null,
    pct: hasRoot ? formatPct(op.totalUs, rootDurationUs as number) : '',
  }));

  const countWidth = maxWidth(rows.map(r => r.count));
  const totalWidth = maxWidth(rows.map(r => r.total));
  const perCallWidth = maxWidth(rows.map(r => r.perCall));
  const pctWidth = maxWidth(rows.map(r => r.pct));
  const fixed =
    GUTTER.length +
    countWidth +
    totalWidth +
    perCallWidth +
    GAP.length * 4 +
    (hasRoot ? pctWidth + GAP.length + MIN_BAR_WIDTH : 0);
  const nameWidth = clamp(
    maxWidth(rows.map(r => r.name)),
    MIN_NAME_WIDTH,
    Math.max(MIN_NAME_WIDTH, columns - fixed)
  );
  const barWidth = clamp(
    columns - fixed + MIN_BAR_WIDTH - nameWidth,
    MIN_BAR_WIDTH,
    MAX_SHARE_BAR_WIDTH
  );

  const lines = [`${GUTTER}${chalk.bold('Repeated operations')}`];
  for (const row of rows) {
    const cells = [
      ellipsis(row.name, nameWidth).padEnd(nameWidth),
      row.count.padStart(countWidth),
      row.total.padStart(totalWidth),
      chalk.dim(row.perCall.padEnd(perCallWidth)),
    ];
    if (row.share !== null) {
      cells.push(
        renderShareBar(row.share, barWidth),
        row.pct.padStart(pctWidth)
      );
    }
    lines.push(`${GUTTER}${cells.join(GAP)}`.trimEnd());
  }
  return lines.join('\n');
}

function renderChart(analysis: AnalyzedTrace, columns: number): string {
  if (analysis.treeOrder.length === 0 && analysis.orphanOrder.length === 0) {
    return `${GUTTER}No spans.`;
  }

  const rows = collapseRows(analysis.treeOrder);
  const orphanRows = collapseRows(analysis.orphanOrder);
  const labels = buildTreeLabels(rows);
  const orphanLabels = buildTreeLabels(orphanRows);
  const layout = computeLayout(
    [...rows, ...orphanRows].map(
      (row, i) => [...labels, ...orphanLabels][i] + countSuffix(row)
    ),
    columns
  );
  const placeBars = analysis.rootStartUs !== null;
  const timelineUs = computeTimelineUs(analysis, placeBars);

  const lines = renderAxis(layout, timelineUs);
  rows.forEach((row, i) => {
    lines.push(
      renderRow(row, labels[i], analysis, layout, timelineUs, placeBars)
    );
  });
  if (orphanRows.length > 0) {
    lines.push('', `${GUTTER}${chalk.bold('Orphan spans')}`);
    orphanRows.forEach((row, i) => {
      lines.push(
        renderRow(row, orphanLabels[i], analysis, layout, timelineUs, placeBars)
      );
    });
  }
  if (analysis.truncatedAtDepth) {
    lines.push(
      '',
      `${GUTTER}${chalk.dim(`Tree truncated at depth ${MAX_TREE_DEPTH}.`)}`
    );
  }
  return lines.join('\n');
}

function computeLayout(labels: string[], columns: number): Layout {
  const fixed = GUTTER.length + GAP.length + DURATION_WIDTH + GAP.length;
  const maxName = Math.max(
    MIN_NAME_WIDTH,
    Math.floor((columns - fixed) * 0.45)
  );
  const nameWidth = clamp(maxWidth(labels), MIN_NAME_WIDTH, maxName);
  const barWidth = Math.max(MIN_BAR_WIDTH, columns - fixed - nameWidth);
  return { nameWidth, barWidth };
}

// The timeline covers the root span plus anything that outlives it, such as
// work scheduled after the response was sent.
function computeTimelineUs(
  analysis: AnalyzedTrace,
  placeBars: boolean
): number {
  let end = analysis.rootDurationUs ?? 0;
  for (const info of analysis.spanInfo.values()) {
    const offset = placeBars ? info.startOffsetUs : 0;
    if (offset !== null && info.durationUs !== null) {
      end = Math.max(end, offset + info.durationUs);
    }
  }
  return end;
}

function renderAxis(layout: Layout, timelineUs: number): string[] {
  const { nameWidth, barWidth } = layout;
  const head = `${GUTTER}${chalk.bold('Span'.padEnd(nameWidth))}${GAP}${chalk.bold('Duration'.padStart(DURATION_WIDTH))}${GAP}`;
  const pad = ' '.repeat(
    GUTTER.length + nameWidth + GAP.length * 2 + DURATION_WIDTH
  );
  if (timelineUs <= 0) {
    return [head.trimEnd()];
  }

  const start = '0ms';
  const middle = formatDurationUs(timelineUs / 2);
  const end = formatDurationUs(timelineUs);
  const scale = Array<string>(barWidth).fill(' ');
  const place = (text: string, at: number) => {
    for (let i = 0; i < text.length; i++) {
      if (at + i >= 0 && at + i < barWidth) {
        scale[at + i] = text[i];
      }
    }
  };
  place(start, 0);
  place(end, barWidth - end.length);
  const middleAt = Math.round(barWidth / 2 - middle.length / 2);
  if (
    middleAt > start.length + 1 &&
    middleAt + middle.length < barWidth - end.length - 1
  ) {
    place(middle, middleAt);
  }

  const ticks = Array<string>(barWidth).fill('─');
  ticks[0] = '├';
  ticks[barWidth - 1] = '┤';
  for (const fraction of [0.25, 0.5, 0.75]) {
    const at = Math.round((barWidth - 1) * fraction);
    if (at > 0 && at < barWidth - 1) {
      ticks[at] = '┼';
    }
  }

  return [
    `${head}${chalk.dim(scale.join('').trimEnd())}`,
    `${pad}${chalk.dim(ticks.join(''))}`,
  ];
}

function renderRow(
  row: ChartRow,
  label: string,
  analysis: AnalyzedTrace,
  layout: Layout,
  timelineUs: number,
  placeBars: boolean
): string {
  const intervals: Array<{ offsetUs: number; durationUs: number }> = [];
  let totalUs: number | null = null;
  let isError = false;
  for (const span of row.spans) {
    const info = analysis.spanInfo.get(span.spanId);
    const durationUs = info?.durationUs ?? null;
    const offsetUs = placeBars ? (info?.startOffsetUs ?? null) : 0;
    if (durationUs !== null) {
      totalUs = (totalUs ?? 0) + durationUs;
      if (offsetUs !== null) {
        intervals.push({ offsetUs, durationUs });
      }
    }
    isError ||= span.status?.code === SPAN_STATUS_ERROR;
  }

  const gutter = isError ? `${chalk.red('✗')} ` : GUTTER;
  const suffix = countSuffix(row);
  // Truncate the name, not the count, so `×120` stays visible.
  const shown = ellipsis(label, layout.nameWidth - suffix.length);
  const namePad = ' '.repeat(
    Math.max(0, layout.nameWidth - shown.length - suffix.length)
  );
  const name = `${shown}${chalk.dim(suffix)}`;
  const duration = chalk.dim(
    formatDurationUs(totalUs).padStart(DURATION_WIDTH)
  );
  let bar = '';
  if (timelineUs > 0 && intervals.length === 1) {
    const [only] = intervals;
    bar = renderSpanBar(
      only.offsetUs,
      only.durationUs,
      timelineUs,
      layout.barWidth
    );
  } else if (timelineUs > 0 && intervals.length > 1) {
    bar = renderCoverageBar(intervals, timelineUs, layout.barWidth);
  }
  if (bar) {
    bar = isError ? chalk.red(bar) : chalk.cyan(bar);
  }
  return `${gutter}${name}${namePad}${GAP}${duration}${GAP}${bar}`.trimEnd();
}

function countSuffix(row: ChartRow): string {
  return row.spans.length > 1 ? ` ×${row.spans.length}` : '';
}

/**
 * Groups sibling spans by name, keeping the order of each name's first
 * occurrence. Children of a collapsed group are merged across all of its
 * spans and grouped again, so repeated subtrees collapse at every level.
 */
export function collapseRows(nodes: TreeNode[]): ChartRow[] {
  const roots: Span[] = [];
  const children = new Map<string, Span[]>();
  for (const { span, depth } of nodes) {
    if (depth === 0 || !span.parentSpanId) {
      roots.push(span);
      continue;
    }
    const list = children.get(span.parentSpanId);
    if (list) {
      list.push(span);
    } else {
      children.set(span.parentSpanId, [span]);
    }
  }

  const out: ChartRow[] = [];
  const expand = (group: Span[], depth: number) => {
    out.push({ name: group[0].name || UNNAMED, depth, spans: group });
    const kids = group.flatMap(span => children.get(span.spanId) ?? []);
    if (group.length > 1) {
      kids.sort(compareStart);
    }
    for (const kidGroup of groupByName(kids)) {
      expand(kidGroup, depth + 1);
    }
  };
  for (const group of groupByName(roots)) {
    expand(group, 0);
  }
  return out;
}

function groupByName(spans: Span[]): Span[][] {
  const groups = new Map<string, Span[]>();
  for (const span of spans) {
    const name = span.name || UNNAMED;
    const group = groups.get(name);
    if (group) {
      group.push(span);
    } else {
      groups.set(name, [span]);
    }
  }
  return [...groups.values()];
}

function compareStart(a: Span, b: Span): number {
  const startA = getStartTimeUs(a);
  const startB = getStartTimeUs(b);
  if (startA === null || startB === null) {
    return startA === startB ? 0 : startA === null ? 1 : -1;
  }
  return startA - startB;
}

export function renderSpanBar(
  offsetUs: number,
  durationUs: number,
  timelineUs: number,
  width: number
): string {
  const scale = width / timelineUs;
  const startCol = Math.min(width - 1, Math.floor(offsetUs * scale));
  const length = Math.min(width - startCol, durationUs * scale);
  const full = Math.floor(length);
  const eighths = Math.round((length - full) * 8);
  let bar = FULL_BLOCK.repeat(full);
  if (eighths === 8) {
    bar += FULL_BLOCK;
  } else {
    bar += PARTIAL_BLOCKS[eighths];
  }
  if (bar.length === 0) {
    // Keep zero-width spans visible at their start position.
    bar = PARTIAL_BLOCKS[1];
  }
  return `${' '.repeat(startCol)}${bar}`;
}

function renderShareBar(share: number, width: number): string {
  const filled = clamp(Math.round(share * width), share > 0 ? 1 : 0, width);
  return `${chalk.cyan(FULL_BLOCK.repeat(filled))}${chalk.dim('░'.repeat(width - filled))}`;
}

/**
 * Draws every span of a collapsed row on one track. Each cell shows how much
 * of it the spans cover, so bursts of calls read as dense blocks and gaps
 * between calls stay visible.
 */
export function renderCoverageBar(
  intervals: Array<{ offsetUs: number; durationUs: number }>,
  timelineUs: number,
  width: number
): string {
  const scale = width / timelineUs;
  const coverage = Array<number>(width).fill(0);
  const touched = Array<boolean>(width).fill(false);
  for (const { offsetUs, durationUs } of intervals) {
    const start = Math.min(width, offsetUs * scale);
    const end = Math.min(width, (offsetUs + durationUs) * scale);
    const first = Math.min(width - 1, Math.floor(start));
    touched[first] = true;
    for (let cell = first; cell < Math.ceil(end); cell++) {
      const overlap = Math.min(end, cell + 1) - Math.max(start, cell);
      if (overlap > 0) {
        coverage[cell] = Math.min(1, coverage[cell] + overlap);
        touched[cell] = true;
      }
    }
  }
  let bar = '';
  for (let cell = 0; cell < width; cell++) {
    const eighths = Math.round(coverage[cell] * 8);
    if (eighths >= 8) {
      bar += FULL_BLOCK;
    } else if (eighths > 0) {
      bar += PARTIAL_BLOCKS[eighths];
    } else {
      bar += touched[cell] ? PARTIAL_BLOCKS[1] : ' ';
    }
  }
  return bar.trimEnd();
}

/**
 * Prefixes each span name with box-drawing connectors so the hierarchy reads
 * like `tree`: `├─ child`, `│  └─ grandchild`.
 */
export function buildTreeLabels(
  nodes: Array<{ name: string; depth: number }>
): string[] {
  const isLast = nodes.map((node, i) => {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].depth < node.depth) {
        return true;
      }
      if (nodes[j].depth === node.depth) {
        return false;
      }
    }
    return true;
  });

  const open: boolean[] = [];
  return nodes.map((node, i) => {
    const name = node.name || UNNAMED;
    if (node.depth === 0) {
      open.length = 0;
      return name;
    }
    open.length = node.depth - 1;
    let prefix = '';
    for (let d = 1; d < node.depth; d++) {
      prefix += open[d - 1] ? '│  ' : '   ';
    }
    prefix += isLast[i] ? '└─ ' : '├─ ';
    open[node.depth - 1] = !isLast[i];
    return `${prefix}${name}`;
  });
}

function maxWidth(values: string[]): number {
  return values.reduce((max, value) => Math.max(max, value.length), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
