import chalk from 'chalk';
import {
  MAX_TREE_DEPTH,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  analyze,
  collapseRows,
  isVercelService,
  readAttrString,
} from './analyze';
import {
  collectAttrHints,
  formatDurationUs,
  formatPct,
} from './render-markdown';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import ellipsis from '../../util/output/ellipsis';
import type { AnalyzedTrace, Span, SpanGroup } from './types';

const UNNAMED = '<unnamed>';
const DEFAULT_COLUMNS = 100;
const MIN_COLUMNS = 60;
// Columns left free on the right so output survives small window resizes.
const RIGHT_MARGIN = 4;
const MIN_NAME_WIDTH = 16;
const DURATION_WIDTH = 8;
const MIN_BAR_WIDTH = 16;
const HINT_KEY_WIDTH = 18;
const GAP = '  ';
const GUTTER = '  ';
const FULL_BLOCK = '█';
// Left-aligned partial blocks, indexed by eighths of a cell (0 = empty).
const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const;

// Service colors in order of first appearance, matching the dashboard's
// blue, green, purple, pink, teal. Named terminal colors instead of Geist hex
// keep them readable on both light and dark themes.
const SERVICE_COLORS = [
  'blue',
  'green',
  'magenta',
  'magentaBright',
  'cyan',
] as const;

type ServiceColor = (typeof SERVICE_COLORS)[number];
type Paint = (text: string) => string;

const VERCEL_PREFIX = '▲ ';

type Layout = {
  nameWidth: number;
  barWidth: number;
};

/**
 * One chart row. Sibling spans that share a name collapse into a single row
 * so traces with hundreds of repeated calls stay readable; their children
 * merge the same way, one level down.
 */
export type ChartRow = SpanGroup;

/**
 * Assigns each non-Vercel service a color in order of first appearance, the
 * way the dashboard does. Spans without a service share one color.
 */
function buildServiceColors(
  analysis: AnalyzedTrace
): Map<string, ServiceColor> {
  const colors = new Map<string, ServiceColor>();
  for (const { span } of [...analysis.treeOrder, ...analysis.orphanOrder]) {
    const service = span.serviceName ?? '';
    if (!isVercelService(span) && !colors.has(service)) {
      colors.set(service, SERVICE_COLORS[colors.size % SERVICE_COLORS.length]);
    }
  }
  return colors;
}

/**
 * Bar color for a row, following the dashboard: red for errors, green for
 * OK, gray for Vercel infrastructure, and the service color otherwise.
 */
function paintForSpans(
  spans: Span[],
  colors: Map<string, ServiceColor>
): Paint {
  if (spans.some(span => span.status?.code === SPAN_STATUS_ERROR)) {
    return chalk.red;
  }
  if (spans.some(span => span.status?.code === SPAN_STATUS_OK)) {
    return chalk.green;
  }
  const [first] = spans;
  if (!first) {
    return text => text;
  }
  if (isVercelService(first)) {
    return chalk.gray;
  }
  const color = colors.get(first.serviceName ?? '');
  return color ? chalk[color] : text => text;
}

function prefixFor(spans: Span[]): string {
  return spans[0] && isVercelService(spans[0]) ? VERCEL_PREFIX : '';
}

/**
 * Renders a trace as a terminal waterfall chart: a summary block, errors,
 * repeated operations, and one bar per span positioned on a shared timeline.
 * Used for TTY output; piped and agent output keeps the markdown summary.
 */
export function renderWaterfall(
  trace: Parameters<typeof analyze>[0],
  options: { requestId?: string; columns?: number; partial?: boolean }
): string {
  const analysis = analyze(trace);
  // Fill the terminal width so wide terminals get more detail, but stop short
  // of the edge so a slightly narrower window doesn't wrap every row.
  const columns = Math.max(
    MIN_COLUMNS,
    (options.columns || DEFAULT_COLUMNS) - RIGHT_MARGIN
  );
  const colors = buildServiceColors(analysis);
  const sections: string[] = [
    renderSummary(analysis, options.requestId, options.partial),
  ];
  if (analysis.errorSpans.length > 0) {
    sections.push(renderErrors(analysis));
  }
  if (analysis.repeatedOps.length > 0) {
    sections.push(renderRepeatedOps(analysis, columns, colors));
  }
  sections.push(renderChart(analysis, columns, colors));
  return `${sections.join('\n\n')}\n`;
}

function renderSummary(
  analysis: AnalyzedTrace,
  requestId: string | undefined,
  partial: boolean | undefined
): string {
  const { trace, root, rootDurationUs, errorSpans } = analysis;
  const method = readAttrString(root?.attributes, 'http.method');
  const target = readAttrString(root?.attributes, 'http.target');
  const status = readAttrString(root?.attributes, 'http.status_code');
  const path = method && target ? `${method} ${target}` : (method ?? target);

  const rows = [formatAlignedLabel('Trace', trace.traceId)];
  // Trace-ID lookups have no request ID, like the markdown header.
  if (requestId !== undefined) {
    rows.push(formatAlignedLabel('Request', requestId));
  }
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
  if (partial) {
    rows.push(
      formatAlignedLabel(
        'Incomplete',
        chalk.yellow('Exceeded the span limit, so some spans are missing.')
      )
    );
  }
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

function renderRepeatedOps(
  analysis: AnalyzedTrace,
  columns: number,
  colors: Map<string, ServiceColor>
): string {
  const { repeatedOps, rootDurationUs } = analysis;
  const hasRoot = rootDurationUs !== null && rootDurationUs > 0;
  const spansByName = new Map<string, Span[]>();
  for (const span of analysis.trace.spans) {
    const name = span.name || UNNAMED;
    const list = spansByName.get(name);
    if (list) {
      list.push(span);
    } else {
      spansByName.set(name, [span]);
    }
  }
  const rows = repeatedOps.map(op => ({
    name: op.name,
    paint: paintForSpans(spansByName.get(op.name) ?? [], colors),
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
  const barWidth = Math.max(
    MIN_BAR_WIDTH,
    columns - fixed + MIN_BAR_WIDTH - nameWidth
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
        renderShareBar(row.share, barWidth, row.paint),
        row.pct.padStart(pctWidth)
      );
    }
    lines.push(`${GUTTER}${cells.join(GAP)}`.trimEnd());
  }
  return lines.join('\n');
}

function renderChart(
  analysis: AnalyzedTrace,
  columns: number,
  colors: Map<string, ServiceColor>
): string {
  if (analysis.treeOrder.length === 0 && analysis.orphanOrder.length === 0) {
    return `${GUTTER}No spans.`;
  }

  const rows = collapseRows(analysis.treeOrder);
  const orphanRows = collapseRows(analysis.orphanOrder);
  // Vercel infrastructure spans get the dashboard's `▲` prefix.
  const withPrefix = (row: ChartRow) => ({
    name: `${prefixFor(row.spans)}${row.name}`,
    depth: row.depth,
  });
  const labels = buildTreeLabels(rows.map(withPrefix));
  const orphanLabels = buildTreeLabels(orphanRows.map(withPrefix));
  const layout = computeLayout(
    [...rows, ...orphanRows].map(
      (row, i) => [...labels, ...orphanLabels][i] + countSuffix(row)
    ),
    columns
  );
  const placeBars = analysis.rootStartUs !== null;
  const timelineUs = computeTimelineUs(analysis, placeBars);

  const chart = { analysis, layout, timelineUs, placeBars, colors };
  const lines = renderAxis(layout, timelineUs);
  rows.forEach((row, i) => {
    lines.push(renderRow(row, labels[i], chart));
  });
  if (orphanRows.length > 0) {
    lines.push('', `${GUTTER}${chalk.bold('Orphan spans')}`);
    orphanRows.forEach((row, i) => {
      lines.push(renderRow(row, orphanLabels[i], chart));
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
  {
    analysis,
    layout,
    timelineUs,
    placeBars,
    colors,
  }: {
    analysis: AnalyzedTrace;
    layout: Layout;
    timelineUs: number;
    placeBars: boolean;
    colors: Map<string, ServiceColor>;
  }
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
  // Bars follow the dashboard's colors. Errors are also marked by the `✗`
  // gutter, so color never carries required meaning.
  if (bar) {
    bar = paintForSpans(row.spans, colors)(bar);
  }
  return `${gutter}${name}${namePad}${GAP}${duration}${GAP}${bar}`.trimEnd();
}

function countSuffix(row: ChartRow): string {
  return row.spans.length > 1 ? ` ×${row.spans.length}` : '';
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

function renderShareBar(
  share: number,
  width: number,
  color: (text: string) => string
): string {
  const filled = clamp(Math.round(share * width), share > 0 ? 1 : 0, width);
  return `${color(FULL_BLOCK.repeat(filled))}${chalk.dim('░'.repeat(width - filled))}`;
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
