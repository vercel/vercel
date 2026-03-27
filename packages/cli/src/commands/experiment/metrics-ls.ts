import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { listExperimentMetrics } from '../../util/experiments/metrics';
import { experimentMetricsListSubcommand } from './command';
import table from '../../util/output/table';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';

export default async function metricsLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentMetricsListSubcommand.options
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
  const withMetadata = Boolean(flags['--with-metadata']);

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

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const lsStamp = stamp();

  output.spinner(`Fetching metrics for ${projectSlugLink}`);

  try {
    const metrics = await listExperimentMetrics(client, project.id, {
      withMetadata,
    });
    output.stopSpinner();

    if (asJson) {
      output.print(JSON.stringify({ metrics }, null, 2));
      return 0;
    }

    if (metrics.length === 0) {
      output.log(
        `No metrics found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
      return 0;
    }

    output.log(
      `${plural('metric', metrics.length, true)} for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );

    const headers = ['Slug', 'Name', 'Type', 'Unit'];
    const rows = metrics.map(m => [m.slug, m.name, m.metricType, m.metricUnit]);
    output.print(table([headers, ...rows]));
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
