import ms from 'ms';
import type Client from '../../util/client';
import output from '../../output-manager';
import type { MetricsOptions, MetricsResponse, SonarQuery } from './types';
import { buildFilter } from './filter';
import {
  validateEvent,
  validateDimension,
  validateMeasure,
  validateAggregation,
  formatValidationError,
} from './validation';
import { formatTableOutput, formatJsonOutput } from './output';

/**
 * Parse relative or absolute time to ISO string.
 */
function parseTime(value: string | undefined, defaultDate: Date): string {
  if (!value) {
    return defaultDate.toISOString();
  }

  // Try parsing as relative duration (1h, 30m, 2d, 1w)
  const relative = ms(value);
  if (typeof relative === 'number' && relative > 0) {
    return new Date(Date.now() - relative).toISOString();
  }

  // Try parsing as ISO date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // Fallback - let API handle invalid formats
  return value;
}

/**
 * Parse granularity to API format (ISO 8601 duration).
 * Input: 5m, 1h, 1d
 * Output: PT5M, PT1H, P1D
 */
function parseGranularity(value: string | undefined): string {
  if (!value) {
    return 'PT15M'; // Default: 15 minutes
  }

  // Parse the value and unit
  const match = value.match(/^(\d+)([mhdw])$/i);
  if (!match) {
    return value; // Let API validate
  }

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm':
      return `PT${num}M`;
    case 'h':
      return `PT${num}H`;
    case 'd':
      return `P${num}D`;
    case 'w':
      return `P${num * 7}D`;
    default:
      return value;
  }
}

/**
 * Validate all query options before making API call.
 */
function validateOptions(options: MetricsOptions): {
  valid: boolean;
  error?: string;
} {
  // Validate event
  const eventResult = validateEvent(options.event);
  if (!eventResult.valid) {
    return { valid: false, error: formatValidationError(eventResult) };
  }

  // Validate dimensions
  for (const dim of options.by) {
    const dimResult = validateDimension(options.event, dim);
    if (!dimResult.valid) {
      return { valid: false, error: formatValidationError(dimResult) };
    }
  }

  // Validate measure
  const measureResult = validateMeasure(options.event, options.measure);
  if (!measureResult.valid) {
    return { valid: false, error: formatValidationError(measureResult) };
  }

  // Validate aggregation
  const aggResult = validateAggregation(
    options.event,
    options.measure,
    options.aggregation
  );
  if (!aggResult.valid) {
    return { valid: false, error: formatValidationError(aggResult) };
  }

  return { valid: true };
}

/**
 * Execute a metrics query.
 */
export default async function query(
  client: Client,
  teamSlug: string,
  projectName: string,
  options: MetricsOptions
): Promise<number> {
  // Validate inputs
  const validation = validateOptions(options);
  if (!validation.valid) {
    output.error(validation.error!);
    return 1;
  }

  // Build the query
  const now = new Date();
  const startTime = parseTime(
    options.since,
    new Date(now.getTime() - 60 * 60 * 1000)
  ); // Default: 1h ago
  const endTime = parseTime(options.until, now);
  const filter = buildFilter(options);
  const granularity = parseGranularity(options.granularity);

  const queryBody: SonarQuery = {
    scope: {
      type: 'project-with-slug',
      teamSlug,
      projectName,
    },
    reason: 'cli',
    event: options.event,
    rollups: {
      value: {
        measure: options.measure,
        aggregation: options.aggregation,
      },
    },
    groupBy: options.by,
    filter,
    limit: options.limit,
    tailRollup: 'truncate',
    granularity,
    startTime,
    endTime,
    summaryOnly: options.summary,
  };

  // Make the API call
  // The observability API is on vercel.com, not api.vercel.com
  const baseUrl =
    client.apiUrl === 'https://api.vercel.com'
      ? 'https://vercel.com'
      : client.apiUrl;

  output.spinner('Fetching metrics...');

  try {
    const response = await client.fetch<MetricsResponse>(
      `${baseUrl}/api/observability/metrics`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryBody),
      }
    );

    output.stopSpinner();

    // Format output
    if (options.json) {
      formatJsonOutput(client, queryBody, options, response);
    } else {
      formatTableOutput(client, options, response);
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();

    if (err instanceof Error) {
      // Handle API errors gracefully
      if ('status' in err && typeof (err as any).status === 'number') {
        const status = (err as any).status;
        if (status === 403) {
          output.error(
            'Permission denied. You may not have access to observability data for this project.'
          );
          return 1;
        }
        if (status === 404) {
          output.error(
            'Project not found or observability data is not available.'
          );
          return 1;
        }
      }
      output.error(`Failed to fetch metrics: ${err.message}`);
    } else {
      output.error('Failed to fetch metrics.');
    }
    return 1;
  }
}
