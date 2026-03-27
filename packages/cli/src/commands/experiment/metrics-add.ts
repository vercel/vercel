import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { appendMetricToExperiment } from '../../util/experiments/metrics';
import {
  buildMetricDefinitionFromCli,
  DIRECTIONALITIES,
  METRIC_TYPES,
  METRIC_UNITS,
} from '../../util/experiments/parse-metric-definition';
import { experimentMetricsAddSubcommand } from './command';
import type {
  MetricDirectionality,
  MetricType,
  MetricUnit,
} from '../../util/flags/types';

export default async function metricsAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentMetricsAddSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const flagSlug = flags['--flag'] as string | undefined;
  const name = flags['--name'] as string | undefined;
  const metricType = flags['--metric-type'] as string | undefined;
  const metricUnit = flags['--metric-unit'] as string | undefined;
  const directionality = flags['--directionality'] as string | undefined;
  const description = flags['--description'] as string | undefined;
  const metricFormula = flags['--metric-formula'] as string | undefined;
  const guardrail = Boolean(flags['--guardrail']);

  if (!flagSlug || !name || !metricType || !metricUnit || !directionality) {
    output.error(
      `Required: --flag, --name, --metric-type, --metric-unit, --directionality. Example: ${getCommandName('experiment metrics add --flag my-exp --name "Signup Completed" --metric-type count --metric-unit user --directionality increaseIsGood')}`
    );
    return 1;
  }

  if (!METRIC_TYPES.includes(metricType as MetricType)) {
    output.error(`--metric-type must be one of: ${METRIC_TYPES.join(', ')}`);
    return 1;
  }
  if (!METRIC_UNITS.includes(metricUnit as MetricUnit)) {
    output.error(`--metric-unit must be one of: ${METRIC_UNITS.join(', ')}`);
    return 1;
  }
  if (!DIRECTIONALITIES.includes(directionality as MetricDirectionality)) {
    output.error(
      `--directionality must be one of: ${DIRECTIONALITIES.join(', ')}`
    );
    return 1;
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  const metric = buildMetricDefinitionFromCli({
    name,
    description,
    metricType: metricType as MetricType,
    metricUnit: metricUnit as MetricUnit,
    directionality: directionality as MetricDirectionality,
    metricFormula,
  });

  output.spinner(
    `Adding ${guardrail ? 'guardrail ' : ''}metric "${name}" to ${flagSlug}`
  );

  try {
    const { metric: added } = await appendMetricToExperiment(
      client,
      project.id,
      flagSlug,
      metric,
      { guardrail }
    );
    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ metric: added, flag: flagSlug }, null, 2)}\n`
      );
    } else {
      output.log(
        `Metric "${added.name}" added to experiment on flag "${flagSlug}" (${guardrail ? 'guardrail' : 'primary'}).`
      );
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
