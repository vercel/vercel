import chalk from 'chalk';
import Table from 'cli-table3';
import stripAnsi from 'strip-ansi';
import type { OpenApiCache } from '../../util/openapi/openapi-cache';
import { humanReadableColumnLabel } from '../../util/openapi/column-label';
import type { EndpointInfo, Parameter } from '../../util/openapi/types';
import {
  extractBracePathParamNames,
  getOpenapiQueryOptionParameters,
  parameterNameToCliOptionFlag,
} from '../../util/openapi/openapi-operation-cli';
import {
  foldNamingStyle,
  operationIdToKebabCase,
} from '../../util/openapi/fold-naming-style';
import { noBorderChars } from '../../util/output/table';

/**
 * cli-table3 supports per-cell `wordWrap` (see cell.js); package typings omit it.
 * `wordWrap: false` keeps tag / operation / args on one line so columns stay aligned.
 */
function tableCell(
  content: string,
  wordWrap: boolean
): { content: string; wordWrap: boolean } {
  return { content, wordWrap };
}

function cellDisplayWidth(s: string): number {
  return stripAnsi(s).length;
}

/** Min width for the operation name column in describe tables. */
const NAME_COL_MIN = 14;

/** Min width for the tag column in `openapi ls` / tag `--describe` list tables. */
const TAG_COL_MIN = 10;

/**
 * cli-table3 draws `content` within `colWidth - paddingLeft - paddingRight`
 * (see cell `drawLine`). Our tables use `padding-left: 0` and `padding-right: 2`,
 * so column width must be **content display width + this** or the cell truncates.
 */
const CELL_HORIZONTAL_PADDING = 2;

/** Approximate space between adjacent columns (no visible borders). */
const INTER_COL_GAP = 2;

/** Left margin for OpenAPI list/describe tables (matches help `INDENT`). */
const OPENAPI_TABLE_MARGIN_LEFT = '  ';

/** Gutter budget for N columns: (N - 1) gaps between columns. */
function tableInterColumnGutter(columnCount: number): number {
  return Math.max(0, columnCount - 1) * INTER_COL_GAP;
}

/**
 * Top + left padding for list/describe tables, similar to `vercel --help` sections.
 */
export function wrapOpenapiCliTableOutput(inner: string): string {
  const trimmed = inner.trimEnd();
  if (!trimmed) {
    return '\n';
  }
  const lines = trimmed.split('\n');
  const body = lines.map(l => OPENAPI_TABLE_MARGIN_LEFT + l).join('\n');
  return `\n${body}`;
}

/** Single line of text for models: prefer `description`, else `summary`. */
function describeLine(ep: EndpointInfo): string {
  const raw = ep.description?.trim() || ep.summary?.trim() || '';
  return raw.replace(/\s+/g, ' ');
}

/**
 * Path placeholders for the args column, e.g. `[idOrName]` or `[a] [b]`.
 */
export function formatArgsColumnText(ep: EndpointInfo): string {
  const pathNames = extractBracePathParamNames(ep.path);
  if (pathNames.length === 0) {
    return '';
  }
  return pathNames.map(n => `[${n}]`).join(' ');
}

function parameterHelpText(p: Parameter): string {
  const fromParam = p.description?.trim();
  const fromSchema = p.schema?.description?.trim();
  return (fromParam || fromSchema || '').replace(/\s+/g, ' ');
}

/** One blank line between API summary line and query-option lines. */
const NEWLINES_BEFORE_OPTIONS = '\n\n';

/**
 * API summary (gray) plus query flags: **bold** when `required`, gray when optional.
 * Each `--flag` is padded so OpenAPI parameter/schema descriptions align in a second column when present.
 */
export function formatDescriptionWithQueryOptionLines(
  ep: EndpointInfo
): string {
  const lead = describeLine(ep);
  const queryOpts = getOpenapiQueryOptionParameters(ep);
  if (queryOpts.length === 0) {
    return chalk.gray(lead);
  }

  const flagStrings = queryOpts.map(
    p => `--${parameterNameToCliOptionFlag(p.name)}`
  );
  const flagColW = Math.max(22, ...flagStrings.map(f => f.length));
  const optionLines = queryOpts.map((p, i) => {
    const rawFlag = flagStrings[i];
    const styledFlag = p.required ? chalk.bold(rawFlag) : chalk.gray(rawFlag);
    const pad = ' '.repeat(Math.max(0, flagColW - rawFlag.length));
    const help = parameterHelpText(p);
    if (!help) {
      return `${styledFlag}${pad}`;
    }
    return `${styledFlag}${pad}  ${chalk.dim(help)}`;
  });
  return `${chalk.gray(lead)}${NEWLINES_BEFORE_OPTIONS}${optionLines.join('\n')}`;
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

/** Row for `vercel openapi ls` (all tags): tag + operation only. */
export interface OpenapiLsSummaryRow {
  tagCell: string;
  operation: string;
}

export interface OpenapiListRow {
  /** Tag shown only on the first row for that tag; empty for additional operations. */
  tagCell: string;
  operation: string;
  /** Path args, e.g. `[idOrName]` (plain text for width math). */
  args: string;
  description: string;
}

function buildListRowsForTagSummary(
  displayTag: string,
  endpoints: EndpointInfo[]
): OpenapiLsSummaryRow[] {
  return endpoints.map((ep, i) => ({
    tagCell: i === 0 ? displayTag : '',
    operation: operationIdToCliDisplayKebab(ep),
  }));
}

function buildListRowsForTag(
  displayTag: string,
  endpoints: EndpointInfo[]
): OpenapiListRow[] {
  return endpoints.map((ep, i) => ({
    tagCell: i === 0 ? displayTag : '',
    operation: operationIdToCliDisplayKebab(ep),
    args: formatArgsColumnText(ep),
    description: formatDescriptionWithQueryOptionLines(ep),
  }));
}

/** tag | operation | description (no args column — avoids a wide empty column when no path params). */
function listThreeColTableColWidths(
  rows: OpenapiListRow[]
): [number, number, number] {
  const longestTag = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.tagCell)),
    0
  );
  const longestOp = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.operation)),
    0
  );
  const tagContentW = Math.max(TAG_COL_MIN, longestTag || TAG_COL_MIN);
  const opContentW = Math.max(NAME_COL_MIN, longestOp);
  const tagW = tagContentW + CELL_HORIZONTAL_PADDING;
  const opW = opContentW + CELL_HORIZONTAL_PADDING;
  const termW = process.stdout.columns ?? 80;
  const descW = Math.max(20, termW - tagW - opW - tableInterColumnGutter(3));
  return [tagW, opW, descW];
}

function listTableColWidths(
  rows: OpenapiListRow[]
): [number, number, number, number] {
  const longestTag = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.tagCell)),
    0
  );
  const longestOp = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.operation)),
    0
  );
  const longestArgs = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.args)),
    0
  );
  const tagContentW = Math.max(TAG_COL_MIN, longestTag || TAG_COL_MIN);
  const opContentW = Math.max(NAME_COL_MIN, longestOp);
  const argsContentW = Math.max(2, longestArgs);
  const tagW = tagContentW + CELL_HORIZONTAL_PADDING;
  const opW = opContentW + CELL_HORIZONTAL_PADDING;
  const argsW = argsContentW + CELL_HORIZONTAL_PADDING;
  const termW = process.stdout.columns ?? 80;
  const descW = Math.max(
    20,
    termW - tagW - opW - argsW - tableInterColumnGutter(4)
  );
  return [tagW, opW, argsW, descW];
}

function listSummaryTableColWidths(
  rows: OpenapiLsSummaryRow[]
): [number, number] {
  const longestTag = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.tagCell)),
    0
  );
  const longestOp = rows.reduce(
    (m, r) => Math.max(m, cellDisplayWidth(r.operation)),
    0
  );
  const tagContentW = Math.max(TAG_COL_MIN, longestTag || TAG_COL_MIN);
  const opContentW = Math.max(NAME_COL_MIN, longestOp);
  const tagW = tagContentW + CELL_HORIZONTAL_PADDING;
  const opW = opContentW + CELL_HORIZONTAL_PADDING;
  const termW = process.stdout.columns ?? 80;
  const remainder = termW - tagW - tableInterColumnGutter(2);
  const opColW = Math.max(opW, remainder);
  return [tagW, opColW];
}

/**
 * Top-level `vercel openapi ls` (no tag): tag | operation only.
 */
export function formatOpenapiLsSummaryTable(
  rows: OpenapiLsSummaryRow[]
): string {
  if (rows.length === 0) {
    return '';
  }
  const [tagW, opW] = listSummaryTableColWidths(rows);
  const t = new Table({
    chars: noBorderChars,
    colWidths: [tagW, opW],
    wordWrap: false,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });
  for (const r of rows) {
    t.push([
      tableCell(chalk.cyan(r.tagCell), false),
      tableCell(chalk.white(r.operation), false),
    ]);
  }
  return t.toString();
}

/**
 * Tag-scoped list / describe: tag | operation | args | description (+ options).
 */
export function formatOpenapiListRowsTable(rows: OpenapiListRow[]): string {
  if (rows.length === 0) {
    return '';
  }

  const anyPathArgs = rows.some(r => r.args.length > 0);

  if (!anyPathArgs) {
    const [tagW, opW, descW] = listThreeColTableColWidths(rows);
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
      t.push([
        tableCell(chalk.cyan(r.tagCell), false),
        tableCell(chalk.white(r.operation), false),
        tableCell(r.description, true),
      ]);
    }
    return t.toString();
  }

  const [tagW, opW, argsW, descW] = listTableColWidths(rows);
  const t = new Table({
    chars: noBorderChars,
    colWidths: [tagW, opW, argsW, descW],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });
  for (const r of rows) {
    t.push([
      tableCell(chalk.cyan(r.tagCell), false),
      tableCell(chalk.white(r.operation), false),
      tableCell(r.args ? chalk.dim(r.args) : '', false),
      tableCell(r.description, true),
    ]);
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
 * `--describe` for a tag (no operationId), or `openapi ls <tag>`: full tag | operation | args | description table.
 */
export function formatTagDescribe(
  tag: string,
  endpoints: EndpointInfo[]
): string {
  const displayTag = displayTagForEndpoints(tag, endpoints);
  const rows = buildListRowsForTag(displayTag, endpoints);
  return `${wrapOpenapiCliTableOutput(formatOpenapiListRowsTable(rows))}\n`;
}

function buildOperationDescribeWidthRows(
  main: OpenapiListRow,
  colInfo: {
    defaultColumns: Array<{ path: string; type: string }>;
    limitedColumns?: Array<{ path: string; type: string }>;
  }
): OpenapiListRow[] {
  const rows: OpenapiListRow[] = [
    main,
    {
      tagCell: '',
      operation: '',
      args: 'Response:',
      description: '',
    },
  ];
  for (const c of colInfo.defaultColumns) {
    rows.push({
      tagCell: '',
      operation: '',
      args: humanReadableColumnLabel(c.path),
      description: c.type,
    });
  }
  if (colInfo.limitedColumns?.length) {
    rows.push({
      tagCell: '',
      operation: '',
      args: 'When limited:',
      description: 'true',
    });
    for (const c of colInfo.limitedColumns) {
      rows.push({
        tagCell: '',
        operation: '',
        args: humanReadableColumnLabel(c.path),
        description: c.type,
      });
    }
  }
  return rows;
}

/**
 * `--describe` for one operation: tag | op | args | description (+ options), then
 * `Response:` in the args column with response field rows (label in args, type in description).
 */
export function formatOperationDescribe(
  openApi: OpenApiCache,
  endpoint: EndpointInfo,
  tagAsGivenOnCli: string
): string {
  const displayTag = displayTagForEndpoints(tagAsGivenOnCli, [endpoint]);
  const mainRows = buildListRowsForTag(displayTag, [endpoint]);
  const colInfo = openApi.describeResponseCliColumns(endpoint);

  if (!colInfo) {
    return `${wrapOpenapiCliTableOutput(
      formatOpenapiListRowsTable(mainRows).replace(/\n$/, '')
    ).trimEnd()}\n`;
  }

  const main = mainRows[0];
  const widthRows = buildOperationDescribeWidthRows(main, colInfo);
  const [tagW, opW, argsW, descW] = listTableColWidths(widthRows);

  const t = new Table({
    chars: noBorderChars,
    colWidths: [tagW, opW, argsW, descW],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: {
      'padding-left': 0,
      'padding-right': 2,
    },
  });

  t.push([
    tableCell(chalk.cyan(main.tagCell), false),
    tableCell(chalk.white(main.operation), false),
    tableCell(main.args ? chalk.dim(main.args) : '', false),
    tableCell(main.description, true),
  ]);

  t.push([
    tableCell('', false),
    tableCell('', false),
    tableCell(chalk.gray('Response:'), false),
    tableCell('', false),
  ]);

  for (const c of colInfo.defaultColumns) {
    t.push([
      tableCell('', false),
      tableCell('', false),
      tableCell(humanReadableColumnLabel(c.path), false),
      tableCell(chalk.dim(c.type), false),
    ]);
  }

  if (colInfo.limitedColumns?.length) {
    t.push([
      tableCell('', false),
      tableCell('', false),
      tableCell(chalk.gray('When limited:'), false),
      tableCell(chalk.dim('true'), false),
    ]);
    for (const c of colInfo.limitedColumns) {
      t.push([
        tableCell('', false),
        tableCell('', false),
        tableCell(humanReadableColumnLabel(c.path), false),
        tableCell(chalk.dim(c.type), false),
      ]);
    }
  }

  return `${wrapOpenapiCliTableOutput(t.toString().replace(/\n$/, '')).trimEnd()}\n`;
}

/**
 * `vercel openapi ls` (all tags): lightweight tag | operation table only.
 */
export function formatCliListAll(
  tagsSorted: string[],
  getEndpointsForTag: (tag: string) => EndpointInfo[]
): string {
  const sections: string[] = [];
  for (const tag of tagsSorted) {
    const endpoints = getEndpointsForTag(tag);
    if (endpoints.length === 0) {
      continue;
    }
    const displayTag = displayTagForEndpoints(tag, endpoints);
    const rows = buildListRowsForTagSummary(displayTag, endpoints);
    sections.push(formatOpenapiLsSummaryTable(rows).trimEnd());
  }
  if (sections.length === 0) {
    return '';
  }
  return `${wrapOpenapiCliTableOutput(sections.join('\n\n'))}\n`;
}
