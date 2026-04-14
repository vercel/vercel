import Table from 'cli-table3';
import type { OpenApiCache } from '../../util/openapi/openapi-cache';
import { humanReadableColumnLabel } from '../../util/openapi/column-label';
import type { EndpointInfo } from '../../util/openapi/types';
import {
  foldNamingStyle,
  operationIdToKebabCase,
} from '../../util/openapi/fold-naming-style';
import { noBorderChars } from '../../util/output/table';
import { VERCEL_CLI_ROOT_DISPLAY_KEY } from '../../util/openapi/constants';

/** Min / max width for the operation name column in describe tables. */
const NAME_COL_MIN = 14;
const NAME_COL_MAX = 40;

/** Tag column in `openapi ls` / tag `--describe` list tables. */
const TAG_COL_MIN = 10;
const TAG_COL_MAX = 28;

/** Single line of text for models: prefer `description`, else `summary`. */
function describeLine(ep: EndpointInfo): string {
  const raw = ep.description?.trim() || ep.summary?.trim() || '';
  return raw.replace(/\s+/g, ' ');
}

/**
 * Kebab-case name shown in `openapi ls` / `--describe`: first `x-vercel-cli.aliases`
 * value if set, else `operationId`.
 */
export function operationIdToCliDisplayKebab(ep: EndpointInfo): string {
  const primary = ep.vercelCliAliases[0];
  if (primary) {
    return operationIdToKebabCase(primary);
  }
  return operationIdToKebabCase(ep.operationId || '');
}

function describeTableColWidths(
  endpointRows: EndpointInfo[]
): [number, number] {
  const names = endpointRows.map(operationIdToCliDisplayKebab);
  const longest = names.reduce((m, n) => Math.max(m, n.length), 0);
  const nameW = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, longest));
  const termW = process.stdout.columns ?? 80;
  const descW = Math.max(24, termW - nameW - 4);
  return [nameW, descW];
}

function formatDescribeRowsAsTable(endpoints: EndpointInfo[]): string {
  if (endpoints.length === 0) {
    return '';
  }
  const [nameW, descW] = describeTableColWidths(endpoints);
  const t = new Table({
    chars: noBorderChars,
    colWidths: [nameW, descW],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });
  for (const ep of endpoints) {
    const kebab = operationIdToCliDisplayKebab(ep);
    const text = describeLine(ep);
    t.push([kebab, text]);
  }
  return t.toString();
}

export interface OpenapiListRow {
  /** Tag shown only on the first row for that tag; empty for additional operations. */
  tagCell: string;
  operation: string;
  description: string;
}

function buildListRowsForTag(
  displayTag: string,
  endpoints: EndpointInfo[]
): OpenapiListRow[] {
  return endpoints.map((ep, i) => ({
    tagCell: i === 0 ? displayTag : '',
    operation: operationIdToCliDisplayKebab(ep),
    description: describeLine(ep),
  }));
}

function listTableColWidths(rows: OpenapiListRow[]): [number, number, number] {
  const longestTag = rows.reduce((m, r) => Math.max(m, r.tagCell.length), 0);
  const longestOp = rows.reduce((m, r) => Math.max(m, r.operation.length), 0);
  const tagW = Math.min(
    TAG_COL_MAX,
    Math.max(TAG_COL_MIN, longestTag || TAG_COL_MIN)
  );
  const opW = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, longestOp));
  const termW = process.stdout.columns ?? 80;
  const descW = Math.max(20, termW - tagW - opW - 6);
  return [tagW, opW, descW];
}

/**
 * `openapi ls` / tag `--describe`: tag | operation | description (tag only on first row per tag).
 */
export function formatOpenapiListRowsTable(rows: OpenapiListRow[]): string {
  if (rows.length === 0) {
    return '';
  }
  const [tagW, opW, descW] = listTableColWidths(rows);
  const t = new Table({
    chars: noBorderChars,
    colWidths: [tagW, opW, descW],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });
  for (const r of rows) {
    t.push([r.tagCell, r.operation, r.description]);
  }
  return t.toString();
}

function displayTagForEndpoints(
  tag: string,
  endpoints: EndpointInfo[]
): string {
  return (
    endpoints[0]?.tags?.find(
      t => foldNamingStyle(t) === foldNamingStyle(tag)
    ) ?? tag
  );
}

/**
 * `--describe` for a tag (no operationId): same table as `openapi ls` for that tag.
 */
export function formatTagDescribe(
  tag: string,
  endpoints: EndpointInfo[]
): string {
  const displayTag = displayTagForEndpoints(tag, endpoints);
  const rows = buildListRowsForTag(displayTag, endpoints);
  return `${formatOpenapiListRowsTable(rows)}\n`;
}

function describeColumnTypeTableColWidths(
  rows: Array<{ label: string; type: string }>
): [number, number] {
  const longestLabel = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const longestType = rows.reduce((m, r) => Math.max(m, r.type.length), 0);
  const labelW = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, longestLabel));
  const termW = process.stdout.columns ?? 80;
  const typeW = Math.max(16, Math.min(longestType + 2, termW - labelW - 4));
  return [labelW, typeW];
}

function formatColumnTypesTable(
  rows: Array<{ label: string; type: string }>
): string {
  if (rows.length === 0) {
    return '';
  }
  const [labelW, typeW] = describeColumnTypeTableColWidths(rows);
  const t = new Table({
    chars: noBorderChars,
    colWidths: [labelW, typeW],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });
  for (const r of rows) {
    t.push([r.label, r.type]);
  }
  return t.toString();
}

/**
 * `--describe` for one operation: kebab-case id + description, then CLI response
 * columns with types (same labels as the card / table, value column replaced by type).
 */
export function formatOperationDescribe(
  openApi: OpenApiCache,
  endpoint: EndpointInfo
): string {
  const lines: string[] = [];
  lines.push(formatDescribeRowsAsTable([endpoint]).replace(/\n$/, ''));
  const colInfo = openApi.describeResponseCliColumns(endpoint);
  if (colInfo) {
    lines.push('');
    lines.push(
      `Response (${
        colInfo.displayProperty === VERCEL_CLI_ROOT_DISPLAY_KEY
          ? 'body'
          : colInfo.displayProperty
      })`
    );
    const defaultRows = colInfo.defaultColumns.map(c => ({
      label: humanReadableColumnLabel(c.path),
      type: c.type,
    }));
    lines.push(formatColumnTypesTable(defaultRows));
    if (colInfo.limitedColumns?.length) {
      lines.push('');
      lines.push('When limited: true');
      const limRows = colInfo.limitedColumns.map(c => ({
        label: humanReadableColumnLabel(c.path),
        type: c.type,
      }));
      lines.push(formatColumnTypesTable(limRows));
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * `vercel openapi ls`: one table — tag | operation | description (supported operations only).
 */
export function formatCliListAll(
  tagsSorted: string[],
  getEndpointsForTag: (tag: string) => EndpointInfo[]
): string {
  const rows: OpenapiListRow[] = [];
  for (const tag of tagsSorted) {
    const endpoints = getEndpointsForTag(tag);
    if (endpoints.length === 0) {
      continue;
    }
    const displayTag = displayTagForEndpoints(tag, endpoints);
    rows.push(...buildListRowsForTag(displayTag, endpoints));
  }
  return `${formatOpenapiListRowsTable(rows)}\n`;
}
