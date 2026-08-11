import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { schemaSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  fetchCombinedMetricListOrExit,
  fetchCustomMetricCatalogOrExit,
  fetchMetricDetailOrExit,
  type MetricCatalogMetric,
} from './schema-api';
import { formatErrorJson } from './output';
import formatTable from '../../util/format-table';
import indent from '../../util/output/indent';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import getScope from '../../util/get-scope';
import type { MetricDetail, MetricListItem } from './types';

export default async function schema(
  client: Client,
  telemetry: MetricsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(schemaSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags;
  const positionalArgs = parsedArgs.args.slice(1);
  const positionalMetric =
    positionalArgs[0] === 'schema' ? positionalArgs[1] : positionalArgs[0];

  // Validate output format
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const metric = positionalMetric;
  telemetry.trackCliArgumentMetricId(metric);
  telemetry.trackCliOptionFormat(flags['--format']);

  const { team } = await getScope(client);
  if (!team) {
    const message =
      'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
    } else {
      output.error(message);
    }
    return 1;
  }

  if (metric) {
    const isPlatformMetric = metric.startsWith('vercel.');
    let detail: MetricDetail[] | MetricCatalogMetric[];
    if (isPlatformMetric) {
      const result = await fetchMetricDetailOrExit(
        client,
        team.id,
        metric,
        jsonOutput
      );
      if (typeof result === 'number') return result;
      detail = result;
    } else {
      const result = await fetchCustomMetricCatalogOrExit(
        client,
        team.id,
        jsonOutput,
        metric
      );
      if (typeof result === 'number') return result;
      detail = result;
    }

    if (detail.length === 0) {
      const message = `No metrics match "${metric}". Run \`vercel metrics schema\` to see available metrics.`;
      if (jsonOutput) {
        client.stdout.write(formatErrorJson('METRIC_NOT_FOUND', message));
      } else {
        output.error(message);
      }
      return 1;
    }

    if (jsonOutput) {
      client.stdout.write(JSON.stringify(detail, null, 2));
      return 0;
    }

    output.log(`Metric: ${metric}`);
    const metricsTable = formatMetricsTable(toDisplayMetrics(detail));
    if (metricsTable) {
      output.print(metricsTable);
      output.print('\n');
    }

    return 0;
  }

  // Metric list
  const metricsOrExitCode = await fetchCombinedMetricListOrExit(
    client,
    team.id,
    jsonOutput
  );
  // The helper returns a numeric exit code when it already
  // handled the error output for us.
  if (typeof metricsOrExitCode === 'number') {
    return metricsOrExitCode;
  }

  if (jsonOutput) {
    client.stdout.write(JSON.stringify(metricsOrExitCode, null, 2));
  } else {
    output.log(`${plural('Metric', metricsOrExitCode.length, true)} found`);
    output.print(formatMetricListTable(metricsOrExitCode));
    output.print('\n');
  }

  return 0;
}

function formatMetricListTable(metrics: MetricListItem[]) {
  return indent(
    formatTable(
      ['Metric', 'Description'],
      ['l', 'l'],
      [{ rows: metrics.map(metric => [metric.id, metric.description]) }]
    ),
    1
  );
}

interface DisplayMetric {
  readonly id: string;
  readonly description: string;
  readonly dimensions: readonly string[];
  readonly unit: string;
  readonly aggregations: readonly string[];
}

function toDisplayMetrics(
  metrics: readonly (MetricDetail | MetricCatalogMetric)[]
): DisplayMetric[] {
  return metrics.map(metric => ({
    id: metric.id,
    description: metric.description,
    dimensions: metric.dimensions.map(dimension =>
      typeof dimension === 'string' ? dimension : dimension.name
    ),
    unit: metric.unit,
    aggregations: metric.aggregations.map(aggregation =>
      'defaultAggregation' in metric &&
      aggregation === metric.defaultAggregation
        ? `${aggregation} (default)`
        : aggregation
    ),
  }));
}

function formatMetricsTable(metrics: readonly DisplayMetric[]) {
  if (metrics.length === 0) {
    return null;
  }
  const dimensionsByMetric = metrics.map(metric => metric.dimensions);
  const sharedDimensions = dimensionsByMetric[0]!.filter(dimension =>
    dimensionsByMetric.every(metricDimensions =>
      metricDimensions.includes(dimension)
    )
  );

  const rows = metrics.map(metric => {
    const extraDimensions = metric.dimensions
      .filter(dimension => !sharedDimensions.includes(dimension))
      .map(dimension => `+${dimension}`);

    const aggregations = metric.aggregations.join(', ');

    return {
      metric: metric.id,
      description: metric.description,
      unit: metric.unit,
      aggregations,
      extraDimensions,
    };
  });

  const hasExtraDimensions = rows.some(row => row.extraDimensions.length > 0);

  const tableHeaders = hasExtraDimensions
    ? ['Metric', 'Description', 'Unit', 'Aggregations', 'Dimensions']
    : ['Metric', 'Description', 'Unit', 'Aggregations'];
  const tableRows = rows.map(row =>
    hasExtraDimensions
      ? [
          row.metric,
          row.description,
          row.unit,
          row.aggregations,
          row.extraDimensions.join(', ') || '—',
        ]
      : [row.metric, row.description, row.unit, row.aggregations]
  );

  const sharedDimensionsLine =
    sharedDimensions.length > 0
      ? metrics.length === 1
        ? `Dimensions:\n  ${sharedDimensions.join(', ')}`
        : `Shared dimensions:\n  ${sharedDimensions.join(', ')}`
      : null;

  const table = indent(
    formatTable(
      tableHeaders,
      hasExtraDimensions ? ['l', 'l', 'l', 'l', 'l'] : ['l', 'l', 'l', 'l'],
      [{ rows: tableRows }]
    ),
    1
  );

  return sharedDimensionsLine
    ? `\n${table}\n\n${sharedDimensionsLine}`
    : `\n${table}`;
}
