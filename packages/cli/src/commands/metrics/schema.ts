import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { schemaSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { fetchMetricDetailOrExit, fetchMetricListOrExit } from './schema-api';
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

  // Validate output format
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const metric = flags['--metric'];
  telemetry.trackCliOptionMetric(metric);
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
    // Metric detail
    const detail = await fetchMetricDetailOrExit(
      client,
      team.id,
      metric,
      jsonOutput
    );
    if (typeof detail === 'number') {
      return detail;
    }

    if (jsonOutput) {
      client.stdout.write(JSON.stringify(detail, null, 2));
      return 0;
    }

    output.log(`Metric: ${metric}`);
    const metricsTable = formatMetricsTable(detail);
    if (metricsTable) {
      output.print(metricsTable);
      output.print('\n');
    }

    return 0;
  }

  // Metric list
  const metrics = await fetchMetricListOrExit(client, team.id, jsonOutput);
  if (typeof metrics === 'number') {
    return metrics;
  }

  if (jsonOutput) {
    client.stdout.write(JSON.stringify(metrics, null, 2));
  } else {
    output.log(`${plural('Metric', metrics.length, true)} found`);
    output.print(formatMetricListTable(metrics));
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

function formatMetricsTable(metrics: MetricDetail[]) {
  if (metrics.length === 0) {
    return null;
  }
  return indent(
    formatTable(
      ['Metric', 'Description', 'Unit', 'Aggregations', 'Default'],
      ['l', 'l', 'l', 'l', 'l'],
      [
        {
          rows: metrics.map(metric => [
            metric.id,
            metric.description,
            metric.unit,
            metric.aggregations.join(', '),
            metric.defaultAggregation,
          ]),
        },
      ]
    ),
    1
  );
}
