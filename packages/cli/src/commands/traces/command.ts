import { packageName } from '../../util/pkg-name';
import {
  deploymentOption,
  nextCursorOption,
  protectionBypassOption,
  yesOption,
} from '../../util/arg-common';
import { spanQueryOptions } from './options';
import { tracesConfigCommand } from './config/command';

const requestIdLookupHelp = {
  title: 'Request-ID lookup',
  body: [
    'A request ID in search results does not guarantee traces inspect can retrieve the trace. ' +
      'Lookup requires a matching root span in the same project within 30 minutes after the request-ID timestamp.',
    '',
    'If no matching root is found, lookup returns 404. ' +
      'Use the same --scope and --project for search and inspect.',
  ],
};

export const getSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  default: true,
  description: 'Show a captured trace by trace ID or request ID',
  helpSections: [
    {
      title: 'Trace-ID lookup',
      body: [
        'A 32-character hexadecimal ID selects trace-ID lookup. Other IDs select request-ID lookup.',
        'Trace-ID lookup retrieves the trace directly within the trace retention window. Use the same --scope and --project as search.',
      ],
    },
    requestIdLookupHelp,
  ],
  arguments: [{ name: 'id', required: true }],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Print the raw trace JSON to stdout',
    },
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      argument: 'NAME|ID',
      deprecated: false,
      description: 'Project that owns the trace (default: linked project)',
    },
    {
      name: 'open',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Open the trace in the Vercel Dashboard instead of printing it.',
    },
    {
      name: 'view',
      shorthand: null,
      type: String,
      argument: 'timeline|tree|waterfall',
      deprecated: false,
      description:
        'Dashboard view to open (default: timeline). Only valid with --open.',
    },
  ],
  examples: [
    {
      name: 'Inspect a trace by trace ID',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00`,
    },
    {
      name: 'Inspect a trace by request ID',
      value: `${packageName} traces inspect qb46r-1790847620933-1145d2891a3e`,
    },
    {
      name: 'Print the raw trace JSON',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00 --json`,
    },
    {
      name: 'Inspect a trace without typing the default inspect subcommand',
      value: `${packageName} traces e5c0d1efb3904155472b01692c7f2d00`,
    },
    {
      name: 'Inspect a trace from a specific team and project',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00 --scope my-team --project my-app`,
    },
    {
      name: 'Open the trace in the Vercel Dashboard',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00 --open`,
    },
    {
      name: 'Open the trace in the Vercel Dashboard with the waterfall view',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00 --open --view waterfall`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description:
    'Capture a session trace for a request (alias for `vercel curl --trace`).',
  arguments: [{ name: 'path', required: true }],
  // Options it doesn't define go to curl.
  forwardsUnknownOptions: true,
  options: [
    deploymentOption,
    protectionBypassOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Emit { response, requestId } as JSON on stdout',
    },
    {
      ...yesOption,
      description:
        'Skip the production confirmation prompt (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'Capture a session trace for a request',
      value: `${packageName} traces create /api/hello`,
    },
    {
      name: 'Target a specific deployment',
      value: `${packageName} traces create /api/status --deployment https://your-project-abc123.vercel.app`,
    },
    {
      name: 'Pass curl options after the separator',
      value: `${packageName} traces create /api/test -- --request POST --data '{"name": "John"}'`,
    },
  ],
} as const;

export const searchSubcommand = {
  name: 'search',
  aliases: [],
  description:
    'Search team spans. Use --project to filter one project. Results are newest first. Duration filters do not sort results.',
  helpSections: [
    {
      title: 'Table columns',
      body: [
        'Available: span.startTime, span.duration, span.name, span.status.code, service.name, environment, request.id, trace.id, span.id, parent.id, span.kind',
        'Default: all except environment, request.id, and span.kind.',
      ],
    },
    {
      title: 'KQL filters',
      body: [
        'Fields: project.id, environment, service.name, deployment.id, request.id, user.id, session.id',
        'Span fields: span.name, span.kind, span.id, parent.id, span.isRoot, span.status.code, span.duration',
        'Trace fields: trace.id, trace.state',
        '',
        'Other fields search span attributes first, then resource attributes.',
        '',
        'span.duration uses milliseconds.',
        'span.kind uses the numeric values shown under --kind.',
        'span.status.code uses Error, Ok, or Unset.',
        'Use field:value filters. Plain text search is not supported.',
        'Use NOT to exclude values. End a value with * to match a prefix.',
        'Wrap values with spaces in double quotes. Keep the full query in single quotes.',
      ],
    },
    {
      title: 'Paging',
      body: [
        'When more spans match, a Next page command is printed on stderr.',
        '--json prints one span line per record and ends with a summary line; --non-interactive implies --json.',
        "--next continues from the summary's pagination.next value. It keeps the original team, project, filters, and time window, so it can't be combined with them. --limit can change.",
      ],
    },
  ],
  arguments: [],
  options: [
    ...spanQueryOptions,
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Maximum number of spans (default: 100, max: 1000)',
    },
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      deprecated: false,
      description: 'Filter spans using KQL',
    },
    {
      name: 'columns',
      shorthand: null,
      argument: 'LIST',
      type: String,
      deprecated: false,
      description:
        'Columns to show, in order. Separate names with commas. Cannot be used with --json or --non-interactive.',
    },
    {
      ...nextCursorOption,
      description: "Continue a previous search from its summary's next value",
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output JSON Lines ending with a summary line',
    },
  ],
  examples: [
    {
      name: 'Find production errors for one service',
      value: `${packageName} traces search --environment production --service checkout-api --status error --since 1h`,
    },
    {
      name: 'Use KQL and output JSON Lines',
      value: `${packageName} traces search --query 'http.route:"/api/checkout"' --kind server --json`,
    },
    {
      name: 'Exclude span names starting with app/lib/fetch-api',
      value: `${packageName} traces search --query 'NOT span.name:app/lib/fetch-api*'`,
    },
    {
      name: 'Exclude exact span names',
      value: `${packageName} traces search --query 'NOT span.name:("GET /screenshot/v2" OR "middleware GET")'`,
    },
    {
      name: 'Find spans longer than 2 seconds',
      value: `${packageName} traces search --query 'span.duration > 2000' --columns span.startTime,span.duration,span.name,span.kind,span.status.code`,
    },
    {
      name: "Continue from the summary's next value",
      placeholders: ['<CURSOR>'],
      value: `${packageName} traces search --next <CURSOR> --json`,
    },
  ],
} as const;

export const tracesCommand = {
  name: 'traces',
  aliases: [],
  description: 'Inspect project traces and search spans across a Vercel team.',
  arguments: [{ name: 'id', required: false }],
  subcommands: [
    getSubcommand,
    searchSubcommand,
    createSubcommand,
    tracesConfigCommand,
  ],
  options: [],
  examples: [
    {
      name: 'Inspect a trace by trace ID',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00`,
    },
    {
      name: 'Inspect a trace by request ID',
      value: `${packageName} traces inspect qb46r-1790847620933-1145d2891a3e`,
    },
    {
      name: 'Print the raw trace JSON',
      value: `${packageName} traces inspect e5c0d1efb3904155472b01692c7f2d00 --json`,
    },
    {
      name: 'Capture a session trace for a request',
      value: `${packageName} traces create /api/hello`,
    },
    {
      name: 'Search recent spans',
      value: `${packageName} traces search --status error`,
    },
    {
      name: 'List the trace sampling rules for a project',
      value: `${packageName} traces config ls`,
    },
  ],
} as const;
