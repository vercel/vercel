import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlags } from '../../util/flags/get-flags';
import formatTable from '../../util/format-table';
import output from '../../output-manager';
import { FlagsLsTelemetryClient } from '../../util/telemetry/commands/flags/ls';
import { listSubcommand } from './command';
import type { Flag } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';

export default async function ls(client: Client, argv: string[]) {
  const telemetryClient = new FlagsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const state = (flags['--state'] as 'active' | 'archived') || 'active';

  telemetryClient.trackCliOptionState(state);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);

  try {
    const flagsList = await getFlags(client, project.id, state);
    if (flagsList.length === 0) {
      output.log(`No ${state} feature flags found for ${projectSlugLink}`);
    } else {
      output.log(
        `${chalk.bold(flagsList.length)} feature flag${flagsList.length === 1 ? '' : 's'} found for ${projectSlugLink}`
      );
      // Sort by updatedAt descending (most recently updated first)
      const sortedFlags = flagsList.sort((a, b) => b.updatedAt - a.updatedAt);
      printFlagsTable(sortedFlags);
    }
  } catch (err) {
    printError(err);
    return 1;
  }

  return 0;
}

function printFlagsTable(flags: Flag[]) {
  const headers = ['Name', 'Kind', 'State', 'Variants', 'Updated'];
  const now = Date.now();

  const rows = flags.map(flag => [
    chalk.bold(flag.slug),
    flag.kind,
    flag.state === 'active' ? chalk.green(flag.state) : chalk.gray(flag.state),
    String(flag.variants.length),
    ms(now - flag.updatedAt) + ' ago',
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'l', 'r', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}
