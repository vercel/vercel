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
import { getFlags } from '../../util/flags/get-flags';
import { experimentListSubcommand } from './command';
import table from '../../util/output/table';
import { formatProject } from '../../util/projects/format-project';
import stamp from '../../util/output/stamp';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentListSubcommand.options
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
  const state = (flags['--state'] as 'active' | 'archived') || 'active';

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

  output.spinner(`Fetching experiments for ${projectSlugLink}`);

  try {
    const flagsList = await getFlags(client, project.id, state, {
      hasExperiment: true,
    });
    output.stopSpinner();

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ experiments: flagsList }, null, 2)}\n`
      );
      return 0;
    }

    if (flagsList.length === 0) {
      output.log(
        `No experiments found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
      return 0;
    }

    output.log(
      `${plural('experiment', flagsList.length, true)} for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );

    const headers = ['Slug', 'Status', 'Primary metrics'];
    const rows = flagsList.map(f => {
      const st = f.experiment?.status ?? '—';
      const pm =
        f.experiment?.primaryMetrics?.map(m => m.name).join(', ') ?? '—';
      return [f.slug, st, pm];
    });
    output.print(table([headers, ...rows]));
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
