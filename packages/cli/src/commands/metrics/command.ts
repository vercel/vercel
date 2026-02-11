import { packageName } from '../../util/pkg-name';

export const schemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'List available events, dimensions, and measures',
  arguments: [],
  options: [
    {
      name: 'event',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description: 'Show details for specific event',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List all available events',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Show dimensions and measures for incomingRequest',
      value: `${packageName} metrics schema -e incomingRequest`,
    },
    {
      name: 'Output schema as JSON for agents',
      value: `${packageName} metrics schema -e incomingRequest --json`,
    },
  ],
} as const;

export const querySubcommand = {
  name: 'query',
  aliases: [],
  description: 'Run an observability query',
  default: true,
  arguments: [],
  options: [
    // Required
    {
      name: 'event',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description: 'Event type to query (required)',
    },
    // Metric selection
    {
      name: 'measure',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Measure to aggregate (default: count)',
    },
    {
      name: 'aggregation',
      shorthand: 'a',
      type: String,
      deprecated: false,
      description: 'Aggregation function (default: sum)',
    },
    // Grouping
    {
      name: 'by',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Dimensions to group by',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Max groups to return (default: 100)',
    },
    // Filter shortcuts
    {
      name: 'status',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'HTTP status code (500, 4xx, 5xx)',
    },
    {
      name: 'error',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Error code filter',
    },
    {
      name: 'path',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Request path contains pattern',
    },
    {
      name: 'method',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'HTTP method (GET, POST, etc.)',
    },
    {
      name: 'region',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Edge or function region',
    },
    // Advanced filter
    {
      name: 'filter',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'Raw OData filter expression',
    },
    // Time range
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Start time (1h, 30m, 2d, ISO date)',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'End time (default: now)',
    },
    {
      name: 'granularity',
      shorthand: 'g',
      type: String,
      deprecated: false,
      description: 'Time bucket size (5m, 1h, 1d)',
    },
    // Scope
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID',
    },
    {
      name: 'environment',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Environment filter (production, preview)',
    },
    {
      name: 'deployment',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Deployment ID filter',
    },
    // Output
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
    {
      name: 'summary',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Summary only, no time series',
    },
  ],
  examples: [
    {
      name: 'Get 5xx errors grouped by error code',
      value: `${packageName} metrics -e incomingRequest --status 5xx --by errorCode --since 1h`,
    },
    {
      name: 'P95 latency by route',
      value: `${packageName} metrics -e incomingRequest -m requestDurationMs -a p95 --by route --since 24h`,
    },
    {
      name: 'Function cold start analysis',
      value: `${packageName} metrics -e functionExecution -m coldStartDurationMs -a avg --by route --since 1h`,
    },
    {
      name: 'JSON output for scripting',
      value: `${packageName} metrics -e incomingRequest --status 5xx --by errorCode --json`,
    },
  ],
} as const;

export const metricsCommand = {
  name: 'metrics',
  aliases: [],
  description: 'Query observability metrics for debugging and analysis',
  arguments: [],
  subcommands: [querySubcommand, schemaSubcommand],
  options: [],
  examples: [
    {
      name: 'Error investigation: get 5xx errors grouped by error code',
      value: `${packageName} metrics -e incomingRequest --status 5xx --by errorCode --since 1h`,
    },
    {
      name: 'Performance analysis: P95 latency by route',
      value: `${packageName} metrics -e incomingRequest -m requestDurationMs -a p95 --by route --since 24h`,
    },
    {
      name: 'Traffic analysis: requests by status code',
      value: `${packageName} metrics -e incomingRequest --by httpStatus --since 6h`,
    },
    {
      name: 'List available events and dimensions',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Show schema for a specific event',
      value: `${packageName} metrics schema -e incomingRequest`,
    },
  ],
} as const;
