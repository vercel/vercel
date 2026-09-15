import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import {
  DEFAULT_STALE_AFTER,
  DEFAULT_STALE_FLAGS_LIMIT,
  getStaleFlags,
  MAX_STALE_AFTER_DAYS,
  MAX_STALE_FLAGS_LIMIT,
} from '../../util/flags/get-stale-flags';
import { quoteArg } from '../../util/flags/quote-arg';
import type { StaleFlag, StaleFlagReason } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';
import { FlagsStaleTelemetryClient } from '../../util/telemetry/commands/flags/stale';
import { staleSubcommand } from './command';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

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
  const staleAfter =
    (flags['--stale-after'] as string | undefined) ?? DEFAULT_STALE_AFTER;
  const limit =
    (flags['--limit'] as number | undefined) ?? DEFAULT_STALE_FLAGS_LIMIT;
  const next = flags['--next'] as string | undefined;
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionStaleAfter(staleAfter);
  telemetryClient.trackCliOptionLimit(limit);
  telemetryClient.trackCliOptionNext(next);
  telemetryClient.trackCliFlagJson(json);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_STALE_FLAGS_LIMIT) {
    output.error(
      `The --limit option must be an integer between 1 and ${MAX_STALE_FLAGS_LIMIT}.`
    );
    return 1;
  }

  const staleAfterValidationError = getStaleAfterValidationError(staleAfter);
  if (staleAfterValidationError) {
    output.error(staleAfterValidationError);
    return 1;
  }

  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const staleStamp = stamp();

  output.spinner(`Fetching stale feature flags for ${projectSlugLink}`);

  try {
    const { flags: staleFlags, next: nextCursor } = await getStaleFlags(
      client,
      project.id,
      {
        staleAfter,
        limit,
        cursor: next,
      }
    );
    output.stopSpinner();

    const stalePeriod = `(past ${formatStaleAfter(staleAfter)})`;
    if (json) {
      outputJson(client, staleFlags, nextCursor, staleAfter);
    } else if (staleFlags.length === 0) {
      output.log(
        `No stale feature flags found for ${projectSlugLink} ${stalePeriod} ${chalk.gray(staleStamp())}`
      );
    } else {
      output.log(
        `${plural('stale feature flag', staleFlags.length, true)} found for ${projectSlugLink} ${stalePeriod} ${chalk.gray(staleStamp())}`
      );
      printStaleFlagsTable(staleFlags);
      if (nextCursor) {
        const nextCmd = buildNextPageCommand(flags, nextCursor);
        output.log(`To display the next page, run ${getCommandName(nextCmd)}`);
      }
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getStaleAfterValidationError(value: string): string | null {
  const match = /^([1-9][0-9]*)d$/.exec(value);
  if (!match) {
    return 'The --stale-after option must be a relative day duration like 14d.';
  }

  const days = Number(match[1]);
  if (days > MAX_STALE_AFTER_DAYS) {
    return `The --stale-after option cannot exceed ${MAX_STALE_AFTER_DAYS}d.`;
  }

  return null;
}

function buildNextPageCommand(
  flags: { [key: string]: unknown },
  nextCursor: string
): string {
  const baseFlags = getCommandFlags(flags, ['_', '--next', '--json']);
  return `flags stale${baseFlags} --next ${quoteArg(nextCursor)}`;
}

function outputJson(
  client: Client,
  flags: StaleFlag[],
  next: string | null,
  staleAfter: string
) {
  const jsonOutput = {
    staleAfter,
    flags: flags.map(flag => ({
      slug: flag.slug,
      reason: flag.reason,
    })),
    pagination: { next },
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function printStaleFlagsTable(flags: StaleFlag[]) {
  const headers = ['Flag', 'Reason'];
  const rows = flags.map(flag => [
    chalk.bold(flag.slug),
    formatStaleReason(flag.reason),
  ]);

  const table = formatTable(headers, ['l', 'l'], [{ name: '', rows }]);
  output.print(`\n${table}\n${formatStaleReasonTypesTable()}\n`);
}

function formatStaleReasonTypesTable(): string {
  return formatTable(
    ['Type', 'Description'],
    ['l', 'l'],
    [
      {
        name: 'Types',
        rows: [
          [
            'Unused',
            'No production deployment references it, and it has no evaluations in the selected period.',
          ],
          [
            'Redundant',
            'All configured and evaluated variants return the production default value.',
          ],
        ],
      },
    ]
  );
}

function formatStaleAfter(value: string): string {
  const match = /^([1-9][0-9]*)d$/.exec(value);
  if (!match) {
    return value;
  }

  return plural('day', Number(match[1]), true);
}

function formatStaleReason(reason: StaleFlagReason): string {
  switch (reason) {
    case 'unused':
      return 'Unused';
    case 'redundant':
      return 'Redundant';
    default:
      return reason;
  }
}
