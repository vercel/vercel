import {
  environmentOption,
  formatOption,
  jsonOption,
  projectOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const schemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'List available metrics or inspect a specific metric.',
  arguments: [{ name: 'metric-or-prefix', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List all metrics',
      value: `${packageName} metrics schema`,
    },
    {
      name: 'Show metric details',
      value: `${packageName} metrics schema vercel.function_invocation`,
    },
    {
      name: 'Schema as JSON for agents',
      value: `${packageName} metrics schema vercel.request.count --json`,
    },
  ],
} as const;

export const metricsCommand = {
  name: 'metrics',
  aliases: [],
  description: 'Query observability metrics for your Vercel project or team.',
  arguments: [{ name: 'metric-id', required: false }],
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
      name: 'aggregation',
      shorthand: null,
      deprecatedShorthand: 'a',
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
      shorthand: 'n',
      deprecatedShorthand: 'l',
      type: Number,
      deprecated: false,
      description: 'Max groups per time bucket (default: 10)',
      argument: 'N',
    },
    {
      name: 'order-by',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Order grouped results by value or count (default: count, or value when count is unsupported)',
      argument: 'value|count',
    },
    {
      name: 'order',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Order direction for grouped results: asc or desc (default: desc)',
      argument: 'asc|desc',
    },
    {
      name: 'query',
      shorthand: 'q',
      type: [String],
      deprecated: false,
      get description() {
        return process.env.FF_LEGACY_METRICS
          ? 'OData filter expression (repeatable, ANDed together)'
          : 'KQL filter expression (repeatable, ANDed together)';
      },
      argument: 'TEXT',
    },
    // Hidden: `--filter` and `-f` are the old names of `--query`.
    {
      name: 'filter',
      shorthand: 'f',
      type: [String],
      deprecated: true,
      description: 'Deprecated alias for `--query`',
      argument: 'EXPR',
    },
    {
      ...environmentOption,
      description:
        'Limit the query to one environment, such as production or preview',
    },
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--environment production`',
    },
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: 1h ago)`,
    },
    untilOption,
    {
      name: 'granularity',
      shorthand: null,
      deprecatedShorthand: 'g',
      type: String,
      deprecated: false,
      description:
        'Time bucket size: 1m, 5m, 15m, 1h, 4h, 1d (default: auto; raised when too fine for the time range)',
      argument: 'SIZE',
    },
    {
      name: 'bucket-timezone',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'IANA timezone for calendar bucket alignment only; does not shift --since/--until or output timestamps (e.g., Europe/Paris)',
      argument: 'ZONE',
    },
    {
      ...projectOption,
      shorthand: 'p',
    },
    {
      name: 'all',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Query across all projects for the team',
    },
    formatOption,
    jsonOption,
  ],
  get examples() {
    const canonical = !process.env.FF_LEGACY_METRICS;
    const httpStatus = canonical ? 'httpStatus' : 'http_status';
    const errorCode = canonical ? 'errorCode' : 'error_code';
    const aiProvider = canonical ? 'aiProvider' : 'ai_provider';
    const aiGatewayCostMetric = canonical
      ? 'vercel.ai_gateway.request.cost'
      : 'vercel.ai_gateway_request.cost';
    const pageViewMetric = canonical
      ? 'vercel.analytics.page_view.count'
      : 'vercel.analytics_pageview.count';
    const visitorId = canonical ? 'visitorId' : 'visitor_id';
    const projectId = canonical ? 'projectId' : 'project_id';
    const statusFilter = canonical ? 'httpStatus >= 500' : 'http_status ge 500';
    const routeFilter = canonical
      ? `'route:"/api"'`
      : `"contains(request_path, '/api')"`;

    return [
      {
        name: '5xx errors by error code in the last hour',
        value: `${packageName} metrics vercel.function_invocation.count --query "${statusFilter}" --group-by ${errorCode} --since 1h`,
      },
      {
        name: 'Function invocations by HTTP status code',
        value: `${packageName} metrics vercel.function_invocation.count --group-by ${httpStatus} --since 6h`,
      },
      {
        name: 'Function duration by route',
        value: `${packageName} metrics vercel.function_invocation.function_duration_ms --aggregation avg --group-by route --since 1h`,
      },
      {
        name: 'AI Gateway costs by provider',
        value: `${packageName} metrics ${aiGatewayCostMetric} --aggregation sum --group-by ${aiProvider} --since 7d`,
      },
      {
        name: 'Core Web Vitals (LCP) by route',
        value: `${packageName} metrics vercel.speed_insights.lcp_ms --aggregation p75 --environment production --group-by route --since 7d`,
      },
      {
        name: 'Routes with the lowest p75 LCP',
        value: `${packageName} metrics vercel.speed_insights.lcp_ms --aggregation p75 --environment production --group-by route --since 7d --order-by value --order asc`,
      },
      {
        name: canonical
          ? 'Daily pageviews'
          : 'Daily pageviews with a Paris-aligned bucket',
        value: canonical
          ? `${packageName} metrics ${pageViewMetric} --since 7d --granularity 1d`
          : `${packageName} metrics ${pageViewMetric} --since 7d --granularity 1d --bucket-timezone Europe/Paris`,
      },
      {
        name: 'Visitors time series from the top 5 countries',
        value: `${packageName} metrics ${pageViewMetric} --aggregation unique/${visitorId} --group-by country --since 1d --granularity 1h --limit 5`,
      },
      {
        name: 'List available metrics',
        value: `${packageName} metrics schema`,
      },
      {
        name: 'Function executions matching an API route',
        value: `${packageName} metrics vercel.function_invocation.count --query ${routeFilter} --group-by route --since 1h`,
      },
      {
        name: 'Function executions matching multiple filters',
        value: `${packageName} metrics vercel.function_invocation.count --query "${statusFilter}" --query ${routeFilter} --since 1h`,
      },
      {
        name: 'Show schema for a metric prefix',
        value: `${packageName} metrics schema vercel.request`,
      },
      {
        name: 'Team-wide function executions by project',
        value: `${packageName} metrics --all vercel.function_invocation.count --group-by ${projectId} --since 24h`,
      },
    ];
  },
} as const;
