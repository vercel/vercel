import { formatOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const schemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'List available metrics or inspect a specific metric.',
  arguments: [],
  options: [
    {
      name: 'metric',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Show details for a specific metric',
      argument: 'NAME',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List all metrics',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Inspect metrics under a prefix',
      value: `${packageName} metrics schema --metric vercel.requests`,
    },
    {
      name: 'Inspect a specific metric',
      value: `${packageName} metrics schema --metric vercel.requests.count`,
    },
    {
      name: 'Schema as JSON',
      value: `${packageName} metrics schema --metric vercel.requests.count --format=json`,
    },
  ],
} as const;

export const metricsCommand = {
  name: 'metrics',
  aliases: [],
  description: 'Query observability metrics for your Vercel project or team.',
  arguments: [],
  subcommands: [
    // Hidden placeholder so the help synopsis renders [command] as optional
    // (help.ts treats `command` as required unless a subcommand has `default: true`)
    {
      name: 'query',
      aliases: [],
      description: '',
      default: true,
      hidden: true,
      arguments: [],
      options: [],
      examples: [],
    },
    schemaSubcommand,
  ],
  options: [
    {
      name: 'metric',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Metric id to query (e.g., vercel.requests.count)',
      argument: 'NAME',
    },
    {
      name: 'aggregation',
      shorthand: 'a',
      type: String,
      deprecated: false,
      description:
        'Aggregation function (default: sum for counts/bytes/currency, avg for durations/memory/ratios)',
      argument: 'FN',
    },
    {
      name: 'group-by',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Dimensions to group by (repeatable)',
      argument: 'DIM',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Max groups per time bucket (default: 10)',
      argument: 'N',
    },
    {
      name: 'filter',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'OData filter expression',
      argument: 'EXPR',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Start time: relative (1h, 30m, 2d) or ISO date (default: 1h)',
      argument: 'TIME',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'End time (default: now)',
      argument: 'TIME',
    },
    {
      name: 'granularity',
      shorthand: 'g',
      type: String,
      deprecated: false,
      description: 'Time bucket size: 5m, 15m, 1h, 1d (default: auto)',
      argument: 'SIZE',
    },
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID (default: linked project)',
      argument: 'NAME_OR_ID',
    },
    {
      name: 'all',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Query across all projects for the team',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Request count by route in the last hour',
      value: `${packageName} metrics --metric vercel.requests.count --group-by route --since 1h`,
    },
    {
      name: 'Request duration by route in the last hour',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --group-by route --since 1h`,
    },
    {
      name: 'Team-wide request count by project in the last 24 hours',
      value: `${packageName} metrics --all --metric vercel.requests.count --group-by project_id --since 24h`,
    },
    {
      name: 'List available metrics',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Inspect the request metrics',
      value: `${packageName} metrics schema --metric vercel.requests`,
    },
    {
      name: 'Inspect a specific metric',
      value: `${packageName} metrics schema --metric vercel.requests.count`,
    },
    {
      name: 'Query a specific project by name or id',
      value: `${packageName} metrics --project vercel-site --metric vercel.requests.request_duration_ms -a p95 --group-by route --since 24h --limit 200`,
    },
    {
      name: 'Filter by route substring',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --group-by route --since 24h -f "contains(route, 'logs')"`,
    },
    {
      name: 'Filter request count by request path substring',
      value: `${packageName} metrics --metric vercel.requests.count --group-by request_path --since 7d --limit 200 -f "contains(request_path, '/api/logs/')"`,
    },
    {
      name: 'Query a single route',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --since 7d --group-by request_path -f "request_path eq '/api/logs/request-logs'"`,
    },
    {
      name: 'Break down a route by HTTP status',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --group-by http_status --since 24h -f "route eq '/user/[search]'"`,
    },
    {
      name: 'Break down a route by cache result',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --group-by cache_result --since 24h -f "route eq '/user/[search]'"`,
    },
    {
      name: 'Break down a route by deployment',
      value: `${packageName} metrics --metric vercel.requests.request_duration_ms -a p95 --group-by deployment_id --since 24h -f "route eq '/user/[search]'"`,
    },
    {
      name: 'Return JSON output',
      value: `${packageName} metrics --metric vercel.requests.count --group-by route --since 1h --format=json`,
    },
  ],
} as const;
