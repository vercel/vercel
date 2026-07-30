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
import { formatMetricListTable, formatMetricsTable } from './schema-format';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import getScope from '../../util/get-scope';

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
    // Metric detail
    const detailOrExitCode = await fetchMetricDetailOrExit(
      client,
      team.id,
      metric,
      jsonOutput
    );
    // fetchMetricDetailOrExit() returns a numeric exit code when it already
    // handled the error output for us.
    if (typeof detailOrExitCode === 'number') {
      return detailOrExitCode;
    }

    if (jsonOutput) {
      client.stdout.write(JSON.stringify(detailOrExitCode, null, 2));
      return 0;
    }

    output.log(`Metric: ${metric}`);
    const metricsTable = formatMetricsTable(detailOrExitCode);
    if (metricsTable) {
      output.print(metricsTable);
      output.print('\n');
    }

    return 0;
  }

  // Metric list
  const metricsOrExitCode = await fetchMetricListOrExit(
    client,
    team.id,
    jsonOutput
  );
  // fetchMetricListOrExit() returns a numeric exit code when it already
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
