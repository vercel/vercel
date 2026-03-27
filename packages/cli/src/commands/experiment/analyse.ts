import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { fetchExperimentResults } from '../../util/experiments/fetch-experiment-results';
import { experimentAnalyseSubcommand } from './command';
import { extractBarChartRows, renderAsciiBars } from './format-results';

export default async function analyse(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentAnalyseSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags, args } = parsedArgs;
  const slug = args[0];
  if (!slug) {
    output.error(
      'Missing experiment slug. Example: `vc experiment analyse my-flag`.'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const peek = Boolean(flags['--peek']);
  const metricEventName =
    (flags['--metric-event-name'] as string | undefined);
  const unitField =
    (flags['--unit-field'] as string | undefined) ?? 'visitorId';

  if (!metricEventName || metricEventName.length === 0) {
    output.error(
      'Please specify --metric-event-name, e.g. --metric-event-name purchase'
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

  output.spinner(`Fetching experiment results for ${slug}`);

  try {
    const results = await fetchExperimentResults(client, project.id, {
      experimentName: slug,
      metricEventName,
      unitField,
      peek,
    });
    output.stopSpinner();

    const payload = {
      experimentSlug: slug,
      projectId: project.id,
      peek,
      query: {
        metricEventName,
        unitField,
      },
      results,
    };

    if (asJson) {
      client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    output.log(
      `${chalk.bold('Experiment')}: ${slug}  ${chalk.dim(`(project ${project.id})`)}`
    );
    if (peek) {
      output.log(
        chalk.dim(
          'peek: partial results may be shown while the experiment is running'
        )
      );
    }
    output.print('');

    const bars = extractBarChartRows(results);
    if (bars) {
      output.print(chalk.bold('Relative scale (best-effort)'));
      output.print(renderAsciiBars(bars));
      output.print('');
    }

    output.print(chalk.bold('Results (JSON)'));
    output.print(JSON.stringify(results, null, 2));
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
