import {
  ATTR_HINT_KEYS,
  MAX_TREE_DEPTH,
  SPAN_STATUS_ERROR,
  analyze,
  readAttrString,
} from './analyze';
import ellipsis from '../../util/output/ellipsis';
import type { AnalyzedTrace, Span, Trace, TreeNode } from './types';

const UNKNOWN = '<unknown>';
const UNNAMED = '<unnamed>';
const ATTR_VALUE_MAX_LEN = 80;
const TRACE_ID_MAX_LEN = 13;

export function renderMarkdown(
  trace: Trace,
  options: { requestId: string }
): string {
  const analysis = analyze(trace);
  const sections: string[] = [];
  sections.push(renderHeader(analysis, options));
  if (analysis.errorSpans.length > 0) {
    sections.push(renderErrors(analysis));
  }
  if (analysis.repeatedOps.length > 0) {
    sections.push(renderRepeatedOps(analysis));
  }
  sections.push(renderTree(analysis));
  return `${sections.join('\n\n')}\n`;
}

function renderHeader(
  analysis: AnalyzedTrace,
  options: { requestId: string }
): string {
  const { trace, root, rootDurationUs, errorSpans } = analysis;
  const attributes = root?.attributes;
  const method = readAttrString(attributes, 'http.method');
  const target = readAttrString(attributes, 'http.target');
  const status = readAttrString(attributes, 'http.status_code');
  const endpoint = formatEndpoint(method, target, status);
  const duration = formatDurationUs(rootDurationUs);
  const spans = formatSpansLine(trace.spans.length, errorSpans.length);

  const lines = [
    `# Trace ${ellipsis(trace.traceId, TRACE_ID_MAX_LEN)}`,
    '',
    `- **Trace id:** ${trace.traceId}`,
    `- **Request id:** ${options.requestId}`,
    `- **Endpoint:** ${endpoint}`,
    `- **Duration:** ${duration}`,
    `- **Spans:** ${spans}`,
  ];
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
      formatDurationUs(op.totalUs),
      formatDurationUs(op.perCallUs),
    ];
    if (showPctColumn && rootDurationUs !== null) {
      cells.push(formatPct(op.totalUs, rootDurationUs));
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderTree(analysis: AnalyzedTrace): string {
  const lines = ['## Span tree', ''];
  if (analysis.treeOrder.length === 0 && analysis.orphanOrder.length === 0) {
    lines.push('_No spans._');
    return lines.join('\n');
  }
  for (const node of analysis.treeOrder) {
    lines.push(formatTreeRow(node, analysis));
  }
  if (analysis.orphanOrder.length > 0) {
    lines.push('', '### Orphan spans', '');
    for (const node of analysis.orphanOrder) {
      lines.push(formatTreeRow(node, analysis));
    }
  }
  if (analysis.truncatedAtDepth) {
    lines.push('', `_Tree truncated at depth ${MAX_TREE_DEPTH}._`);
  }
  return lines.join('\n');
}

function formatTreeRow(node: TreeNode, analysis: AnalyzedTrace): string {
  const { span, depth } = node;
  const info = analysis.spanInfo.get(span.spanId);
  const indent = '  '.repeat(depth);
  const parts: string[] = [];

  const durationUs = info?.durationUs ?? null;
  parts.push(`\`${formatDurationUs(durationUs)}\``);

  if (analysis.rootDurationUs !== null && analysis.rootDurationUs > 0) {
    parts.push(formatPct(durationUs, analysis.rootDurationUs));
  }
  if (analysis.rootStartUs !== null) {
    const offset = info?.startOffsetUs ?? null;
    parts.push(formatOffset(offset));
  }

  parts.push(`\`${span.name || UNNAMED}\``);

  if (span.status?.code === SPAN_STATUS_ERROR) {
    const message = span.status.message;
    parts.push(message ? `[error: ${message}]` : '[error]');
  }

  const [hint] = collectAttrHints(span.attributes);
  if (hint) {
    parts.push(`— \`${hint.key}\`: ${hint.value}`);
  }

  return `${indent}- ${parts.join(' ')}`;
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

function formatOffset(us: number | null): string {
  if (us === null) {
    return `+${UNKNOWN}`;
  }
  return `+${formatDurationUs(us)}`;
}

function formatPct(us: number | null, rootUs: number): string {
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

function collectAttrHints(
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
