import type Client from '../../util/client';
import output from '../../output-manager';
import type { QueryMetadata, MetricsQueryResponse } from './types';

export function getRollupColumnName(
  metric: string,
  aggregation: string
): string {
  return `${metric.replace(/\./g, '_')}_${aggregation}`;
}

export function formatQueryJson(
  query: QueryMetadata,
  response: MetricsQueryResponse
): string {
  return JSON.stringify(
    {
      query,
      summary: response.summary ?? [],
      data: response.data ?? [],
      statistics: response.statistics ?? {},
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
