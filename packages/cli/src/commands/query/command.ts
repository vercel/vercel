import { packageName } from '../../util/pkg-name';

export const queryCommand = {
  name: 'query',
  aliases: ['q'],
  description: 'Run queries against observability data.',
  arguments: [],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description:
        'Project ID or name (defaults to linked project, exclusive with --team)',
    },
    {
      name: 'team',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Team ID or slug (exclusive with --project)',
    },
    {
      name: 'event',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'Event type to query (e.g., "incomingRequest", "functionExecution")',
    },
    {
      name: 'measure',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Measure to aggregate (e.g., "duration", "count")',
    },
    {
      name: 'aggregation',
      shorthand: 'a',
      type: String,
      deprecated: false,
      description:
        'Aggregation function (e.g., "avg", "sum", "max", "min", "p99")',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Start time (ISO format or relative: 1h, 30m, 1d)',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'End time (ISO format or relative, default: now)',
    },
    {
      name: 'group-by',
      shorthand: 'g',
      type: [String],
      deprecated: false,
      description: 'Dimensions to group by (can be specified multiple times)',
    },
    {
      name: 'filter',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'OData filter expression',
    },
    {
      name: 'granularity',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Time bucket size (e.g., "1h", "30m", default: "1h")',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Maximum number of results per bucket (default: 10)',
    },
    {
      name: 'order-by',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Rollup name to order by',
    },
    {
      name: 'summary-only',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Return only summary data, not timeseries',
    },
    {
      name: 'input',
      shorthand: 'i',
      type: String,
      deprecated: false,
      description: 'Read query from JSON file or stdin (use "-" for stdin)',
    },
    {
      name: 'json',
      shorthand: 'j',
      type: Boolean,
      deprecated: false,
      description: 'Output raw JSON response',
    },
    {
      name: 'show-statistics',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include query performance statistics in output',
    },
  ],
  examples: [
    {
      name: 'Query average request duration for the last hour',
      value: `${packageName} query --event incomingRequest --measure duration --aggregation avg --since 1h`,
    },
    {
      name: 'Query error count grouped by status code',
      value: `${packageName} query --event incomingRequest --measure count --aggregation sum --group-by statusCode --filter "statusCode ge 500" --since 24h`,
    },
    {
      name: 'Query with multiple grouping dimensions',
      value: `${packageName} query --event functionExecution --measure executionTime --aggregation p99 --group-by region --group-by runtime --since 1h`,
    },
    {
      name: 'Complex query from JSON file',
      value: `${packageName} query --input query.json`,
    },
    {
      name: 'Query from stdin with JSON output',
      value: `echo '{"event":"incomingRequest","rollups":{"value":{"measure":"count","aggregation":"sum"}},"startTime":"2024-01-26T00:00:00Z","endTime":"2024-01-26T12:00:00Z"}' | ${packageName} query --input - --json`,
    },
    {
      name: 'Query for a specific team',
      value: `${packageName} query --team my-team --event incomingRequest --measure count --aggregation sum --since 1h`,
    },
  ],
} as const;
