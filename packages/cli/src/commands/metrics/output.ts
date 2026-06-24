import type Client from '../../util/client';
import output from '../../output-manager';
import {
  AGGREGATIONS,
  type QueryMetadata,
  type MetricsQueryResponse,
} from './types';

export function getRollupColumnName(
  metric: string,
  aggregation: string
): string {
  // Aggregations can carry a field (e.g. `unique/visitor_id`); the API
  // flattens both dots and slashes to underscores in column names.
  return `${metric}_${aggregation}`.replace(/[./]/g, '_');
}

function getMetricDimensionName(metric: string): string {
  return metric.split('.').at(-1) ?? metric;
}

function getAggregationDimensionName(aggregation: string): string | undefined {
  return aggregation.split('/')[1];
}

export function getDefaultCountOrderByDisplayName(metric: string): string {
  const metricName = getMetricDimensionName(metric);
  return queryMetricHasSpeedInsightsCount(metric)
    ? `${metricName.replace(/_ms$/, '')}_count`
    : 'count';
}

function queryMetricHasSpeedInsightsCount(metric: string): boolean {
  return (
    metric.includes('.speed_insights.') &&
    !/(^|_)count$/.test(getMetricDimensionName(metric))
  );
}

export function getOrderByDisplayName(
  metric: string,
  aggregation: string,
  orderBy: string
): string {
  if (orderBy === getRollupColumnName(metric, aggregation)) {
    return (
      getAggregationDimensionName(aggregation) ?? getMetricDimensionName(metric)
    );
  }

  const metricParts = metric.split('.');
  metricParts.pop();
  const rollupPrefix =
    metricParts.length > 0 ? `${metricParts.join('_')}_` : '';
  if (!rollupPrefix || !orderBy.startsWith(rollupPrefix)) {
    return orderBy;
  }

  let displayName = orderBy.slice(rollupPrefix.length);
  for (const aggregationName of AGGREGATIONS) {
    const suffix = `_${aggregationName}`;
    if (displayName.endsWith(suffix)) {
      displayName = displayName.slice(0, -suffix.length);
      break;
    }
  }

  return displayName;
}

export function getOrderByRollupName(
  metric: string,
  aggregation: string,
  orderBy: string | undefined
): string | undefined {
  if (!orderBy) {
    return undefined;
  }

  const displayName =
    getAggregationDimensionName(aggregation) ?? getMetricDimensionName(metric);
  const defaultCountDisplayName = getDefaultCountOrderByDisplayName(metric);
  if (
    orderBy === 'count' ||
    (orderBy === defaultCountDisplayName &&
      defaultCountDisplayName !== displayName)
  ) {
    return undefined;
  }

  if (orderBy === displayName) {
    return getRollupColumnName(metric, aggregation);
  }

  return orderBy;
}

export function getResolvedOrderMetadata(
  query: Pick<
    QueryMetadata,
    'metric' | 'aggregation' | 'orderBy' | 'orderDirection'
  >,
  response: Pick<MetricsQueryResponse, 'orderBy' | 'orderDirection'>
): Pick<QueryMetadata, 'orderBy' | 'orderDirection'> {
  let orderBy = response.orderBy
    ? getOrderByDisplayName(query.metric, query.aggregation, response.orderBy)
    : query.orderBy
      ? getOrderByDisplayName(query.metric, query.aggregation, query.orderBy)
      : undefined;
  const metricName = getMetricDimensionName(query.metric);
  if (
    orderBy === metricName &&
    response.orderBy &&
    (!query.orderBy ||
      query.orderBy === 'count' ||
      query.orderBy === getDefaultCountOrderByDisplayName(query.metric)) &&
    !/(^|_)count$/.test(metricName)
  ) {
    orderBy = getDefaultCountOrderByDisplayName(query.metric);
  }
  const orderDirection = response.orderDirection ?? query.orderDirection;

  return {
    ...(orderBy ? { orderBy } : {}),
    ...(orderDirection ? { orderDirection } : {}),
  };
}

export function formatQueryJson(
  query: QueryMetadata,
  response: MetricsQueryResponse
): string {
  const orderMetadata = getResolvedOrderMetadata(query, response);
  const queryWithResponseMetadata: QueryMetadata = {
    ...query,
    ...orderMetadata,
  };

  return JSON.stringify(
    {
      query: queryWithResponseMetadata,
      summary: response.summary ?? [],
      data: response.data ?? [],
      statistics: response.statistics ?? {},
      ...orderMetadata,
    },
    null,
    2
  );
}

export function formatErrorJson(
  code: string,
  message: string,
  allowedValues?: string[]
): string {
  const error: { code: string; message: string; allowedValues?: string[] } = {
    code,
    message,
  };
  if (allowedValues && allowedValues.length > 0) {
    error.allowedValues = allowedValues;
  }
  return JSON.stringify({ error }, null, 2);
}

export function handleApiError(
  err: {
    status: number;
    code?: string;
    serverMessage?: string;
    allowedValues?: string[];
  },
  jsonOutput: boolean,
  client: Client,
  overrides: Partial<Record<number, { code?: string; message: string }>> = {}
): number {
  let code: string;
  let message: string;

  const override = overrides[err.status];
  if (override) {
    code = override.code || err.code || 'BAD_REQUEST';
    message = override.message;
  } else {
    switch (err.status) {
      case 402:
        code = err.code || 'PAYMENT_REQUIRED';
        message =
          err.serverMessage ||
          'This feature requires an Observability Plus subscription. Upgrade at https://vercel.com/dashboard/settings/billing';
        break;
      case 429:
        code = err.code || 'RATE_LIMITED';
        message =
          err.serverMessage ||
          'You have reached the metrics query rate limit. Please wait and try again. If you need a higher limit, request one from your Vercel account team.';
        break;
      case 403:
        code = 'FORBIDDEN';
        message =
          'You do not have permission to query metrics for this project/team.';
        break;
      case 500:
        code = 'INTERNAL_ERROR';
        message = 'An internal error occurred. Please try again later.';
        break;
      case 504:
        code = 'TIMEOUT';
        message =
          'The query timed out. Try a shorter time range or fewer groups.';
        break;
      case 400:
        code = err.code || 'BAD_REQUEST';
        message = err.serverMessage || `API error (${err.status})`;
        break;
      default:
        code = err.code || 'BAD_REQUEST';
        message = err.serverMessage || `API error (${err.status})`;
    }
  }

  if (jsonOutput) {
    client.stdout.write(formatErrorJson(code, message, err.allowedValues));
  } else {
    output.error(message);
    if (err.allowedValues && err.allowedValues.length > 0) {
      output.print(`\nAvailable values: ${err.allowedValues.join(', ')}\n`);
    }
  }
  return 1;
}
