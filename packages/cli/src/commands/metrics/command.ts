import { formatOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const schemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'List available events, dimensions, and measures.',
  arguments: [],
  options: [
    {
      name: 'event',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description: 'Show details for a specific event',
      argument: 'NAME',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List all events',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Show event details',
      value: `${packageName} metrics schema -e vercel.function_execution`,
    },
    {
      name: 'Schema as JSON for agents',
      value: `${packageName} metrics schema -e vercel.edge_request --format=json`,
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
      name: 'event',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'Event type to query (e.g., vercel.function_execution, vercel.edge_request)',
      argument: 'NAME',
    },
    {
      name: 'measure',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Measurement to aggregate (default: count)',
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
      name: '5xx errors by error code in the last hour',
      value: `${packageName} metrics -e vercel.function_execution -f "http_status ge 500" --group-by error_code --since 1h`,
    },
    {
      name: 'Function invocations by HTTP status code',
      value: `${packageName} metrics -e vercel.function_execution --group-by http_status --since 6h`,
    },
    {
      name: 'Function duration by route',
      value: `${packageName} metrics -e vercel.function_execution -m function_duration_ms -a avg --group-by route --since 1h`,
    },
    {
      name: 'AI Gateway costs by provider',
      value: `${packageName} metrics -e vercel.ai_gateway_request -m cost -a sum --group-by ai_provider --since 7d`,
    },
    {
      name: 'Core Web Vitals (LCP) by route',
      value: `${packageName} metrics -e vercel.speed_insights_metric -m lcp -a p75 --group-by route --since 7d`,
    },
    {
      name: 'List available events',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Function executions matching a path pattern',
      value: `${packageName} metrics -e vercel.function_execution -f "contains(request_path, '/api')" --group-by route --since 1h`,
    },
    {
      name: 'Show schema for an event',
      value: `${packageName} metrics schema -e vercel.edge_request`,
    },
    {
      name: 'Team-wide function executions by project',
      value: `${packageName} metrics --all -e vercel.function_execution --group-by project_id --since 24h`,
    },
  ],
} as const;
