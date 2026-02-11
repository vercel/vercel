import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import table from '../../util/output/table';
import type {
  MetricsOptions,
  MetricsResponse,
  MetricsSummaryItem,
  SonarQuery,
} from './types';

/**
 * Format metric value with appropriate suffix.
 */
function formatValue(value: number, unit?: string): string {
  if (unit === 'milliseconds') {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}s`;
    }
    return `${value.toFixed(0)}ms`;
  }

  if (unit === 'bytes') {
    if (value >= 1024 * 1024 * 1024) {
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (value >= 1024) {
      return `${(value / 1024).toFixed(2)} KB`;
    }
    return `${value.toFixed(0)} B`;
  }

  if (unit === 'megabytes') {
    return `${value.toFixed(1)} MB`;
  }

  if (unit === 'percent') {
    return `${value.toFixed(1)}%`;
  }

  if (unit === 'usd') {
    return `$${value.toFixed(4)}`;
  }

  // Count or generic number
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return value.toLocaleString();
}

/**
 * Format table output for human consumption.
 */
export function formatTableOutput(
  client: Client,
  options: MetricsOptions,
  response: MetricsResponse
): void {
  const { summary, statistics } = response;
  const groupBy = options.by;

  if (summary.length === 0) {
    output.print(chalk.dim('No data found for the specified query.\n'));
    return;
  }

  // Determine column headers
  const headers: string[] = [...groupBy.map(d => d.toUpperCase()), 'VALUE'];
  if (summary.length > 1) {
    headers.push('% OF TOTAL');
  }

  // Build rows
  const rows: string[][] = [];
  const totalValue =
    statistics.totalValue || summary.reduce((sum, item) => sum + item.value, 0);

  for (const item of summary) {
    const row: string[] = [];

    // Dimension values
    for (const dim of groupBy) {
      const dimValue = item[dim];
      row.push(
        dimValue !== undefined && dimValue !== null
          ? String(dimValue)
          : '(empty)'
      );
    }

    // Value
    row.push(formatValue(item.value));

    // Percentage
    if (summary.length > 1 && totalValue > 0) {
      const percent = (item.value / totalValue) * 100;
      row.push(`${percent.toFixed(1)}%`);
    }

    rows.push(row);
  }

  // Print header row
  const headerRow = [headers.map(h => chalk.dim(h))];
  output.print(table(headerRow, { hsep: 4 }) + '\n');

  // Print data rows
  output.print(table(rows, { hsep: 4 }) + '\n\n');

  // Print summary line
  const timeRangeDesc = options.since ? `in last ${options.since}` : '';
  output.print(
    chalk.dim(
      `Total: ${formatValue(totalValue)} ${timeRangeDesc} (${statistics.totalGroups} groups)\n`
    )
  );
}

/**
 * Format JSON output for machine consumption.
 */
export function formatJsonOutput(
  client: Client,
  query: Partial<SonarQuery>,
  options: MetricsOptions,
  response: MetricsResponse
): void {
  output.stopSpinner();
  client.stdout.write(
    JSON.stringify(
      {
        query: {
          event: options.event,
          measure: options.measure,
          aggregation: options.aggregation,
          groupBy: options.by,
          filter: query.filter,
          startTime: query.startTime,
          endTime: query.endTime,
          granularity: query.granularity,
        },
        summary: response.summary,
        data: response.data,
        statistics: response.statistics,
      },
      null,
      2
    ) + '\n'
  );
}

/**
 * Get dimensions from summary item (all keys except 'value').
 */
export function getDimensionKeys(item: MetricsSummaryItem): string[] {
  return Object.keys(item).filter(k => k !== 'value');
}
