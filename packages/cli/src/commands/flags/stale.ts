import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import { validateTimeBound } from '../../util/command-validation';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlags } from '../../util/flags/get-flags';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { FlagsStaleTelemetryClient } from '../../util/telemetry/commands/flags/stale';
import { staleSubcommand } from './command';
import type { Flag } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';

const DEFAULT_STALE_AGE = '90d';

type FlagState = 'active' | 'archived';

export default async function stale(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsStaleTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(staleSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const state = (flags['--state'] as FlagState | undefined) || 'active';
  const olderThan = flags['--older-than'] || DEFAULT_STALE_AGE;
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliOptionState(state);
  telemetryClient.trackCliOptionOlderThan(olderThan);
  telemetryClient.trackCliFlagJson(json);

  if (!isFlagState(state)) {
    output.error(
      `Invalid state "${state}". Valid values are: active, archived.`
    );
    return 1;
  }

  const olderThanResult = validateTimeBound(olderThan);
  if (!olderThanResult.valid) {
    output.error(olderThanResult.message);
    return 1;
  }
  const staleCutoff = olderThanResult.value;
  if (staleCutoff === undefined) {
    output.error('Missing value for --older-than.');
    return 1;
  }

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
  const staleStamp = stamp();

  output.spinner(`Fetching ${state} feature flags for ${projectSlugLink}`);

  try {
    const flagsList = await getFlags(client, project.id, state);
    output.stopSpinner();

    const now = Date.now();
    const cutoff = staleCutoff.getTime();
    const staleFlags = flagsList
      .filter(flag => flag.updatedAt < cutoff)
      .sort((a, b) => a.updatedAt - b.updatedAt);

    if (json) {
      outputJson(client, staleFlags, {
        cutoff,
        olderThan,
        now,
      });
    } else if (staleFlags.length === 0) {
      output.log(
        `No stale ${state} feature flags found for ${projectSlugLink} older than ${olderThan} ${chalk.gray(staleStamp())}`
      );
    } else {
      output.log(
        `${plural('stale feature flag', staleFlags.length, true)} found for ${projectSlugLink} older than ${olderThan} ${chalk.gray(staleStamp())}`
      );
      printFlagsTable(staleFlags, now);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function isFlagState(state: string): state is FlagState {
  return state === 'active' || state === 'archived';
}

function outputJson(
  client: Client,
  flags: Flag[],
  opts: {
    cutoff: number;
    olderThan: string;
    now: number;
  }
) {
  const jsonOutput = {
    olderThan: {
      value: opts.olderThan,
      cutoff: opts.cutoff,
    },
    cutoff: opts.cutoff,
    flags: flags.map(flag => ({
      id: flag.id,
      slug: flag.slug,
      description: flag.description ?? null,
      kind: flag.kind,
      state: flag.state,
      variants: flag.variants,
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt,
      staleFor: opts.now - flag.updatedAt,
    })),
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function printFlagsTable(flags: Flag[], now: number) {
  const headers = ['Name', 'Kind', 'State', 'Last Updated', 'Age'];

  const rows = flags.map(flag => [
    chalk.bold(flag.slug),
    flag.kind,
    flag.state === 'active' ? chalk.green(flag.state) : chalk.gray(flag.state),
    new Date(flag.updatedAt).toISOString().slice(0, 10),
    ms(now - flag.updatedAt) + ' ago',
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}
