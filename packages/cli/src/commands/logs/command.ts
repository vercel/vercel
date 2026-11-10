import { packageName } from '../../util/pkg-name';
import {
  deploymentOption as sharedDeploymentOption,
  formatOption,
  nextCursorOption,
  projectOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';
import {
  requestsSource,
  runtimeSource,
  wrapFieldNames,
  type LogsSource,
} from './sources';

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 10_000;
export const DEFAULT_WINDOW = '30m';

const deploymentOption = {
  ...sharedDeploymentOption,
  description: 'Filter to a deployment ID or URL',
} as const;

const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: false,
  description: 'Filter by environment, including custom environments',
} as const;

const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Output JSON Lines ending with a summary line',
} as const;

const logsNextOption = {
  ...nextCursorOption,
  description: "Continue a previous query from its summary's next value",
} as const;

const logsProjectOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Select a project (default: linked project)',
} as const;

const logsSinceOption = {
  ...sinceOption,
  description: `Start time: ISO 8601, relative, or now (default: ${DEFAULT_WINDOW} before the end)`,
} as const;

const logsUntilOption = {
  ...untilOption,
  description: 'End time: ISO 8601, relative, or now (default: now)',
} as const;

// Deprecated: accepted and hidden. Results are always bounded.
const followOption = {
  name: 'follow',
  shorthand: 'f',
  type: Boolean,
  deprecated: true,
  description: 'Deprecated; logs always returns a bounded result',
} as const;

function queryOption(records: string) {
  return {
    name: 'query',
    shorthand: 'q',
    type: String,
    argument: 'EXPRESSION',
    deprecated: false,
    description: `Filter ${records} with KQL-inspired syntax`,
  } as const;
}

function limitOption(records: string) {
  return {
    name: 'limit',
    shorthand: 'n',
    type: Number,
    argument: 'NUMBER',
    deprecated: false,
    description: `Limit returned ${records} (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
  } as const;
}

function options(records: string, filterTarget: string) {
  return [
    deploymentOption,
    environmentOption,
    queryOption(filterTarget),
    formatOption,
    jsonOption,
    limitOption(records),
    logsNextOption,
    logsProjectOption,
    logsSinceOption,
    logsUntilOption,
    followOption,
  ] as const;
}

const timeHelpLines = [
  'Use --since 1h for the last hour; --until 1h ends one hour ago.',
  `Without --since, the window is the ${DEFAULT_WINDOW} before --until (or now). Start must be before end.`,
  'requestId filters use the same window; set --since and --until as needed.',
  'Query context and Next page commands are printed on stderr.',
  '--json prints typed lines and ends with a summary; --non-interactive implies --json.',
  '--next keeps the original target, filter, and window, and uses the team in the cursor.',
  'Paging is best-effort: records sharing a timestamp at a page boundary can repeat or be skipped.',
];

// Values seen across stored runtime logs; the API accepts others.
const runtimeCommonValueLines = [
  'source: function, middleware, ci, edge, daemon',
  'level:  error, warning, info, fatal',
  'stream: stdout, stderr',
];

function filterHelpRows(source: LogsSource) {
  return source.filterFields.map(field => ({
    syntax: field.name,
    description: `${field.type}; example: ${field.example}`,
  }));
}

const commonSyntaxRows = [
  { syntax: 'field:value', description: 'Match a value' },
  { syntax: 'field:(a OR b)', description: 'Match either value' },
  {
    syntax: 'field:*',
    description: 'Match records where the field is present',
  },
  { syntax: 'field != value', description: 'Exclude a value' },
  { syntax: 'field:*text*', description: 'Match text within a string field' },
];

const commonSyntaxNotes = [
  'Double quote field values that contain spaces or reserved characters.',
  'Quotes work only in field values.',
  'Wildcards support prefix, suffix, and contains matching.',
  'Infix wildcards are unavailable.',
  '--deployment and --environment combine with --query using AND.',
];

export const runtimeSubcommand = {
  name: 'runtime',
  aliases: [],
  default: true,
  summary: 'Display runtime log entries',
  description: [
    'Display runtime log entries',
    '',
    `${packageName} logs is equivalent to ${packageName} logs runtime.`,
    `Defaults: linked project, all environments, latest ${DEFAULT_LIMIT} entries, last ${DEFAULT_WINDOW}.`,
    'Display full messages and stack traces from newest to oldest.',
    ...timeHelpLines,
    'The producer column shows service when present, otherwise source.',
    'Team-owned projects only.',
  ].join('\n'),
  arguments: [],
  options: options('entries', 'runtime entries'),
  helpSections: [
    {
      title: 'Common --query fields',
      placement: 'afterOptions',
      rows: filterHelpRows(runtimeSource),
      body: [
        '',
        'Common values:',
        ...runtimeCommonValueLines.map(line => `  ${line}`),
        '',
        'Additional public fields supported by the API are accepted.',
      ],
    },
    {
      title: 'Filter syntax (KQL-inspired)',
      placement: 'afterOptions',
      rows: [
        ...commonSyntaxRows,
        { syntax: 'AND, OR, NOT, (...)', description: 'Combine expressions' },
        {
          syntax: 'timeout',
          description: 'Search message tokens, ignoring case',
        },
      ],
      body: [
        '',
        'Multiple bare words match with AND, in any order:',
        'unexpected token equals unexpected AND token.',
        'Search messages with unquoted words; bare "unexpected token" is rejected.',
        'Write AND inside OR groups to make grouping clear:',
        'json AND (parse OR (unexpected AND token)).',
        'Use the requestId value from a log record; quote IDs that contain colons.',
        ...commonSyntaxNotes,
      ],
    },
  ],
  examples: [
    {
      name: 'Display recent runtime logs',
      value: `${packageName} logs runtime`,
    },
    {
      name: 'Find runtime errors containing timeout',
      value: `${packageName} logs runtime --query 'level:error AND timeout'`,
    },
    {
      name: 'Find messages containing several words',
      value: `${packageName} logs runtime --query 'json AND (parse OR (unexpected AND token))'`,
    },
    {
      name: 'Find warnings and errors in one region',
      value: `${packageName} logs runtime --query 'level:(error OR warning) AND region:iad1'`,
    },
    {
      name: 'Find production errors',
      value: `${packageName} logs runtime --environment production --query 'level:error'`,
    },
    {
      name: 'Output recent entries for one request as JSON Lines',
      placeholders: ['<request-id>'],
      value: `${packageName} logs runtime --query 'requestId:"<request-id>"' --json`,
    },
    {
      name: 'Print only runtime entries from JSON Lines',
      value: `${packageName} logs runtime --json | jq 'select(.type == "log") | .data'`,
    },
  ],
} as const;

export const requestsSubcommand = {
  name: 'requests',
  aliases: [],
  summary: 'Display CDN request records',
  description: [
    'Display CDN request records',
    '',
    `Defaults: linked project, all environments, latest ${DEFAULT_LIMIT} requests, last ${DEFAULT_WINDOW}.`,
    'Display HTTP status, method, cache result, request ID, and host and path.',
    'Display the selected requests from newest to oldest.',
    ...timeHelpLines,
    'Time bounds are rounded down to whole seconds.',
    'Background function executions are always excluded, even if a filter selects them.',
    'Team-owned projects only.',
  ].join('\n'),
  arguments: [],
  options: options('requests', 'requests'),
  helpSections: [
    {
      title: 'Common --query fields',
      placement: 'afterOptions',
      rows: filterHelpRows(requestsSource),
      body: ['', 'Additional public fields supported by the API are accepted.'],
    },
    {
      title: 'Filter syntax (KQL-inspired)',
      placement: 'afterOptions',
      rows: [
        ...commonSyntaxRows,
        { syntax: '>, >=, <, <=', description: 'Compare numeric fields' },
        { syntax: 'AND, OR, NOT, (...)', description: 'Combine expressions' },
      ],
      body: [
        '',
        'Use field expressions; bare-text search is unavailable for requests.',
        'Use the requestId value from a request record; quote IDs that contain colons.',
        ...commonSyntaxNotes,
      ],
    },
  ],
  examples: [
    {
      name: 'Display recent CDN requests',
      value: `${packageName} logs requests`,
    },
    {
      name: 'Find requests with server errors',
      value: `${packageName} logs requests --query 'httpStatus >= 500 AND httpStatus < 600'`,
    },
    {
      name: 'Find POST requests with cache misses',
      value: `${packageName} logs requests --query 'requestMethod:POST AND cacheResult:MISS'`,
    },
    {
      name: 'Find requests for checkout paths',
      value: `${packageName} logs requests --query 'requestPath:*checkout*'`,
    },
    {
      name: 'Find production server errors',
      value: `${packageName} logs requests --environment production --query 'httpStatus >= 500 AND httpStatus < 600'`,
    },
    {
      name: 'Output request records as JSON Lines',
      value: `${packageName} logs requests --query 'httpStatus >= 500' --json`,
    },
    {
      name: 'Check whether more requests matched',
      value: `${packageName} logs requests --json | jq 'select(.type == "summary") | .pagination'`,
    },
  ],
} as const;

const FIELD_LIST_WIDTH = 64;

export const logsCommand = {
  name: 'logs',
  aliases: ['log'],
  description: [
    'Display logs.',
    '',
    `Defaults: linked project, all environments, latest ${DEFAULT_LIMIT} records, last ${DEFAULT_WINDOW}.`,
    'Display the selected records from newest to oldest.',
    ...timeHelpLines,
    'Team-owned projects only.',
  ].join('\n'),
  arguments: [],
  subcommandsTitle: 'Data sources',
  subcommands: [runtimeSubcommand, requestsSubcommand],
  options: options('records', 'the selected source'),
  helpSections: [
    {
      title: 'Common --query fields',
      placement: 'afterOptions',
      body: [
        'runtime (default)',
        ...wrapFieldNames(
          runtimeSource.filterFields.map(field => field.name),
          FIELD_LIST_WIDTH
        ).map(line => `  ${line}`),
        '  Unquoted bare words search log messages.',
        '  Common values:',
        ...runtimeCommonValueLines.map(line => `    ${line}`),
        '',
        'requests',
        ...wrapFieldNames(
          requestsSource.filterFields.map(field => field.name),
          FIELD_LIST_WIDTH
        ).map(line => `  ${line}`),
        '  Use field expressions to filter request records.',
        '  Background function executions are excluded.',
        '',
        'Additional public fields supported by the API are accepted.',
        `Use ${packageName} logs runtime --help or ${packageName} logs requests --help for types and examples.`,
      ],
    },
  ],
  examples: [
    {
      name: 'Display recent runtime logs',
      value: `${packageName} logs`,
    },
    {
      name: 'Find runtime errors in production',
      value: `${packageName} logs --query 'level:error AND environment:production'`,
    },
    {
      name: 'Display CDN requests with server errors',
      value: `${packageName} logs requests --query 'httpStatus >= 500'`,
    },
    {
      name: 'Output logs for a deployment as JSON Lines',
      value: `${packageName} logs --deployment dpl_xxxxx --json`,
    },
    {
      name: "Continue from the summary's next value",
      placeholders: ['<CURSOR>'],
      value: `${packageName} logs --next <CURSOR> --json`,
    },
  ],
} as const;
