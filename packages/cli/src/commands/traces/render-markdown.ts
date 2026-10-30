import {
  ATTR_HINT_KEYS,
  MAX_TREE_DEPTH,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  analyze,
  collapseRows,
  readAttrString,
} from './analyze';
import ellipsis from '../../util/output/ellipsis';
import type { AnalyzedTrace, Span, SpanGroup, Trace } from './types';

const UNKNOWN = '<unknown>';
const UNNAMED = '<unnamed>';
const ATTR_VALUE_MAX_LEN = 80;
const TRACE_ID_MAX_LEN = 13;
// Rows kept in the span tree. Sentry's MCP server caps its tree at 96 spans.
export const MAX_TREE_ROWS = 96;
const MAX_SELF_TIME_ROWS = 5;

export function renderMarkdown(
  trace: Trace,
  options: { requestId?: string; partial?: boolean }
): string {
  const analysis = analyze(trace);
  const sections: string[] = [];
  sections.push(renderHeader(analysis, options));
  if (analysis.errorSpans.length > 0) {
    sections.push(renderErrors(analysis));
  }
  if (trace.spans.length > 1) {
    const selfTime = renderSelfTime(analysis);
    if (selfTime) {
      sections.push(selfTime);
    }
  }
  if (analysis.repeatedOps.length > 0) {
    sections.push(renderRepeatedOps(analysis));
  }
  sections.push(renderTree(analysis));
  return `${sections.join('\n\n')}\n`;
}

function renderHeader(
  analysis: AnalyzedTrace,
  options: { requestId?: string; partial?: boolean }
): string {
  const { trace, root, rootDurationUs, errorSpans } = analysis;
  const attributes = root?.attributes;
  const method = readAttrString(attributes, 'http.method');
  const target = readAttrString(attributes, 'http.target');
  const status = readAttrString(attributes, 'http.status_code');
  const endpoint = formatEndpoint(method, target, status);
  const duration = formatMs(rootDurationUs);
  const spans = formatSpansLine(trace.spans.length, errorSpans.length);

  const lines = [
    `# Trace ${ellipsis(trace.traceId, TRACE_ID_MAX_LEN)}`,
    '',
    `- **Trace id:** ${trace.traceId}`,
    ...(options.requestId !== undefined
      ? [`- **Request id:** ${options.requestId}`]
      : []),
    `- **Endpoint:** ${endpoint}`,
    `- **Duration:** ${duration}`,
    `- **Spans:** ${spans}`,
  ];
  if (options.partial) {
    lines.push(
      '',
      '> **Warning:** This trace is incomplete. It exceeded the span limit, so some spans are missing.'
    );
  }
  return lines.join('\n');
}

function renderErrors(analysis: AnalyzedTrace): string {
  const lines = [`## Errors (${analysis.errorSpans.length})`, ''];
  for (const span of analysis.errorSpans) {
    const name = `\`${span.name || UNNAMED}\``;
    const message = span.status?.message;
    const header = message ? `${name} — \`${message}\`` : name;
    lines.push(`- ${header}`);
    for (const hint of collectAttrHints(span.attributes)) {
      lines.push(`  - \`${hint.key}\`: ${hint.value}`);
    }
  }
  return lines.join('\n');
}

/**
 * Spans that spent the most time in their own code rather than waiting on
 * children. This is usually where to look first.
 */
function renderSelfTime(analysis: AnalyzedTrace): string | undefined {
  const { rootDurationUs } = analysis;
  const showPctColumn = rootDurationUs !== null && rootDurationUs > 0;
  const slowest = [...analysis.spanInfo.values()]
    .filter(info => info.selfTimeUs !== null && info.selfTimeUs > 0)
    .sort((a, b) => (b.selfTimeUs ?? 0) - (a.selfTimeUs ?? 0))
    .slice(0, MAX_SELF_TIME_ROWS);
  if (slowest.length === 0) {
    return undefined;
  }

  const header = ['Span', 'Self time', 'Duration'];
  const align = ['---', '---:', '---:'];
  if (showPctColumn) {
    header.push('% of trace');
    align.push('---:');
  }
  const lines = [
    '## Slowest by self time',
    '',
    `| ${header.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
  ];
  for (const info of slowest) {
    const cells = [
      `\`${info.span.name || UNNAMED}\``,
      formatMs(info.selfTimeUs),
      formatMs(info.durationUs),
    ];
    if (showPctColumn && rootDurationUs !== null) {
      cells.push(formatPct(info.selfTimeUs, rootDurationUs));
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderRepeatedOps(analysis: AnalyzedTrace): string {
  const { repeatedOps, rootDurationUs } = analysis;
  const showPctColumn = rootDurationUs !== null && rootDurationUs > 0;

  const header: string[] = ['Operation', 'Count', 'Total', 'Per call'];
  const align: string[] = ['---', '---:', '---:', '---:'];
  if (showPctColumn) {
    header.push('% of root');
    align.push('---:');
  }

  const lines = [
    '## Repeated operations',
    '',
    `| ${header.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
  ];

  for (const op of repeatedOps) {
    const cells = [
      `\`${op.name}\``,
      String(op.count),
      formatMs(op.totalUs),
      formatMs(op.perCallUs),
    ];
    if (showPctColumn && rootDurationUs !== null) {
      cells.push(formatPct(op.totalUs, rootDurationUs));
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

type TreeRow = SpanGroup & {
  durationUs: number | null;
  selfTimeUs: number | null;
  startOffsetUs: number | null;
  isError: boolean;
};

function renderTree(analysis: AnalyzedTrace): string {
  const lines = ['## Span tree', ''];
  if (analysis.treeOrder.length === 0 && analysis.orphanOrder.length === 0) {
    lines.push('_No spans._');
    return lines.join('\n');
  }

  const rows = collapseRows(analysis.treeOrder).map(g =>
    toTreeRow(g, analysis)
  );
  const orphanRows = collapseRows(analysis.orphanOrder).map(g =>
    toTreeRow(g, analysis)
  );
  // One budget across both sections. Depth 0 starts a new branch, so the
  // orphan section's parents resolve within itself.
  const all = [...rows, ...orphanRows];
  const keep = selectRows(all, MAX_TREE_ROWS);

  lines.push(
    'Each row: start offset | duration | self time | % of trace | name | status. Rows marked ×N group N sibling spans with the same name and show their totals.',
    ''
  );
  rows.forEach((row, i) => {
    if (keep.has(i)) {
      lines.push(formatTreeRow(row, analysis));
    }
  });
  if (orphanRows.some((_, i) => keep.has(rows.length + i))) {
    lines.push('', '### Orphan spans', '');
    orphanRows.forEach((row, i) => {
      if (keep.has(rows.length + i)) {
        lines.push(formatTreeRow(row, analysis));
      }
    });
  }

  const omitted = all
    .filter((_, i) => !keep.has(i))
    .reduce((count, row) => count + row.spans.length, 0);
  if (omitted > 0) {
    lines.push(
      '',
      `_${omitted} ${omitted === 1 ? 'span' : 'spans'} omitted to keep the tree short. Errors and the slowest branches are kept. Run with --json for every span._`
    );
  }
  if (analysis.truncatedAtDepth) {
    lines.push('', `_Tree truncated at depth ${MAX_TREE_DEPTH}._`);
  }
  return lines.join('\n');
}

function toTreeRow(group: SpanGroup, analysis: AnalyzedTrace): TreeRow {
  let durationUs: number | null = null;
  let selfTimeUs: number | null = null;
  let startOffsetUs: number | null = null;
  for (const span of group.spans) {
    const info = analysis.spanInfo.get(span.spanId);
    if (info?.durationUs != null) {
      durationUs = (durationUs ?? 0) + info.durationUs;
    }
    if (info?.selfTimeUs != null) {
      selfTimeUs = (selfTimeUs ?? 0) + info.selfTimeUs;
    }
    if (info?.startOffsetUs != null) {
      startOffsetUs =
        startOffsetUs === null
          ? info.startOffsetUs
          : Math.min(startOffsetUs, info.startOffsetUs);
    }
  }
  return {
    ...group,
    durationUs,
    selfTimeUs,
    startOffsetUs,
    isError: group.spans.some(span => span.status?.code === SPAN_STATUS_ERROR),
  };
}

/**
 * Picks at most `cap` rows to show: errors first, then the longest rows, each
 * with its ancestors so the tree keeps its shape. Returns row indexes.
 */
function selectRows(rows: TreeRow[], cap: number): Set<number> {
  const keep = new Set<number>();
  if (rows.length <= cap) {
    rows.forEach((_, i) => keep.add(i));
    return keep;
  }

  const parent: number[] = [];
  const stack: number[] = [];
  rows.forEach((row, i) => {
    stack.length = row.depth;
    parent.push(row.depth > 0 ? (stack[row.depth - 1] ?? -1) : -1);
    stack[row.depth] = i;
  });

  const order = rows
    .map((_, i) => i)
    .sort((a, b) => {
      if (rows[a].isError !== rows[b].isError) {
        return rows[a].isError ? -1 : 1;
      }
      const durationA = rows[a].durationUs ?? -1;
      const durationB = rows[b].durationUs ?? -1;
      return durationB - durationA || a - b;
    });
  for (const i of order) {
    if (keep.size >= cap) {
      break;
    }
    const chain: number[] = [];
    for (let j = i; j !== -1 && !keep.has(j); j = parent[j]) {
      chain.push(j);
    }
    if (keep.size + chain.length <= cap) {
      for (const j of chain) {
        keep.add(j);
      }
    }
  }
  return keep;
}

function formatTreeRow(row: TreeRow, analysis: AnalyzedTrace): string {
  const indent = '  '.repeat(row.depth);
  const { rootDurationUs, rootStartUs } = analysis;
  const count = row.spans.length;

  const start =
    rootStartUs === null || row.startOffsetUs === null
      ? UNKNOWN
      : `+${formatMs(row.startOffsetUs)}`;
  const pct =
    rootDurationUs !== null && rootDurationUs > 0
      ? formatPct(row.durationUs, rootDurationUs)
      : UNKNOWN;
  const name = `\`${row.name}\`${count > 1 ? ` ×${count}` : ''}`;
  const cells = [
    start,
    formatMs(row.durationUs),
    formatMs(row.selfTimeUs),
    pct,
    name,
    formatStatus(row.spans),
  ];

  let line = `${indent}- ${cells.join(' | ')}`;
  // A hint from one span would mislead on a grouped row.
  if (count === 1) {
    const [hint] = collectAttrHints(row.spans[0].attributes);
    if (hint) {
      line += ` — \`${hint.key}\`: ${hint.value}`;
    }
  }
  return line;
}

function formatStatus(spans: Span[]): string {
  const failed = spans.filter(span => span.status?.code === SPAN_STATUS_ERROR);
  if (failed.length > 0) {
    const message = failed.find(span => span.status?.message)?.status?.message;
    const label =
      spans.length > 1
        ? `error (${failed.length} of ${spans.length})`
        : 'error';
    return message ? `${label}: ${message}` : label;
  }
  if (spans.some(span => span.status?.code === SPAN_STATUS_OK)) {
    return 'ok';
  }
  return 'unset';
}

function formatEndpoint(
  method: string | undefined,
  target: string | undefined,
  status: string | undefined
): string {
  const left = method && target ? `${method} ${target}` : (method ?? target);
  const path = left ? `\`${left}\`` : UNKNOWN;
  if (status) {
    return `${path} → ${status}`;
  }
  return path;
}

function formatSpansLine(count: number, errors: number): string {
  if (errors === 0) {
    return String(count);
  }
  const label = errors === 1 ? 'error' : 'errors';
  return `${count} (${errors} ${label})`;
}

/**
 * Formats a duration in milliseconds only, so every number in the Markdown
 * output compares directly without unit conversion.
 */
export function formatMs(us: number | null): string {
  if (us === null) {
    return UNKNOWN;
  }
  const ms = us / 1000;
  if (ms === 0) {
    return '0ms';
  }
  if (ms < 1) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${Math.round(ms)}ms`;
}

/** Picks the largest readable unit. Used by the human-facing waterfall. */
export function formatDurationUs(us: number | null): string {
  if (us === null) {
    return UNKNOWN;
  }
  if (us < 1000) {
    return `${Math.round(us)}μs`;
  }
  if (us < 1_000_000) {
    return `${(us / 1000).toFixed(1)}ms`;
  }
  return `${(us / 1_000_000).toFixed(1)}s`;
}

export function formatPct(us: number | null, rootUs: number): string {
  if (us === null) {
    return UNKNOWN;
  }
  if (rootUs <= 0) {
    return UNKNOWN;
  }
  const pct = (us / rootUs) * 100;
  if (pct > 0 && pct < 1) {
    return '<1%';
  }
  return `${Math.round(pct)}%`;
}

export function collectAttrHints(
  attributes: Span['attributes']
): Array<{ key: string; value: string }> {
  if (!attributes) {
    return [];
  }
  const out: Array<{ key: string; value: string }> = [];
  for (const key of ATTR_HINT_KEYS) {
    const value = readAttrString(attributes, key);
    if (value !== undefined) {
      out.push({ key, value: ellipsis(value, ATTR_VALUE_MAX_LEN) });
    }
  }
  return out;
}
