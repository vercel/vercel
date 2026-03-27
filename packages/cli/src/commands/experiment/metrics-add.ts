import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { putExperimentMetric } from '../../util/experiments/metrics';
import { experimentMetricsAddSubcommand } from './command';
import type {
  MetricDirectionality,
  MetricType,
  MetricUnit,
} from '../../util/flags/types';

const METRIC_TYPES: MetricType[] = ['percentage', 'currency', 'count'];
const METRIC_UNITS: MetricUnit[] = ['user', 'session', 'visitor'];
const DIRS: MetricDirectionality[] = ['increaseIsGood', 'decreaseIsGood'];

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

  const slug = flags['--slug'] as string | undefined;
  const name = flags['--name'] as string | undefined;
  const metricType = flags['--metric-type'] as string | undefined;
  const metricUnit = flags['--metric-unit'] as string | undefined;
  const directionality = flags['--directionality'] as string | undefined;
  const description = flags['--description'] as string | undefined;
  const metricFormula = flags['--metric-formula'] as string | undefined;

  if (!slug || !name || !metricType || !metricUnit || !directionality) {
    output.error(
      `Required: --slug, --name, --metric-type, --metric-unit, --directionality. Example: ${getCommandName('experiment metrics add --slug signup-completed --name "Signup Completed" --metric-type count --metric-unit user --directionality increaseIsGood')}`
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
  if (!DIRS.includes(directionality as MetricDirectionality)) {
    output.error(`--directionality must be one of: ${DIRS.join(', ')}`);
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

  output.spinner(`Creating metric ${slug}`);

  try {
    const metric = await putExperimentMetric(client, project.id, {
      slug,
      name,
      description,
      metricType: metricType as MetricType,
      metricUnit: metricUnit as MetricUnit,
      directionality: directionality as MetricDirectionality,
      metricFormula,
    });
    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify({ metric }, null, 2)}\n`);
    } else {
      output.log(`Metric created: ${metric.slug} (${metric.id})`);
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
