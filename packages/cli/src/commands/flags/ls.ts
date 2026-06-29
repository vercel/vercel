import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import { getFlags, MAX_FLAGS_PAGE_LIMIT } from '../../util/flags/get-flags';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { FlagsLsTelemetryClient } from '../../util/telemetry/commands/flags/ls';
import { listSubcommand } from './command';
import type { Flag } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
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
  const tags = flags['--tag'] as string[] | undefined;
  const createdBy = flags['--created-by'] as string | undefined;
  const maintainerIds = flags['--maintainer-id'] as string[] | undefined;
  const limit = flags['--limit'] as number | undefined;
  const next = flags['--next'] as string | undefined;
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliOptionState(state);
  telemetryClient.trackCliOptionTag(tags);
  telemetryClient.trackCliOptionCreatedBy(createdBy);
  telemetryClient.trackCliOptionMaintainerId(maintainerIds);
  telemetryClient.trackCliOptionLimit(limit);
  telemetryClient.trackCliOptionNext(next);
  telemetryClient.trackCliFlagJson(json);

  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_FLAGS_PAGE_LIMIT)
  ) {
    output.error(
      `The --limit option must be an integer between 1 and ${MAX_FLAGS_PAGE_LIMIT}.`
    );
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
  const lsStamp = stamp();

  output.spinner(`Fetching ${state} feature flags for ${projectSlugLink}`);

  try {
    const { flags: flagsList, next: nextCursor } = await getFlags(
      client,
      project.id,
      {
        state,
        tags,
        createdBy,
        maintainerIds,
        limit,
        cursor: next,
      }
    );
    output.stopSpinner();

    if (json) {
      outputJson(client, flagsList, nextCursor);
    } else if (flagsList.length === 0) {
      output.log(
        `No ${state} feature flags found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
    } else {
      output.log(
        `${plural('feature flag', flagsList.length, true)} found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
      );
      printFlagsTable(flagsList);
      if (nextCursor) {
        const nextCmd = buildNextPageCommand(
          flags,
          tags,
          maintainerIds,
          nextCursor
        );
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

function buildNextPageCommand(
  flags: { [key: string]: unknown },
  tags: string[] | undefined,
  maintainerIds: string[] | undefined,
  nextCursor: string
): string {
  // Forward all passed flags (including globals like --scope/--cwd) except the
  // cursor and repeatable filters. getCommandFlags joins arrays with commas, so
  // re-append --tag/--maintainer-id explicitly to preserve one value per flag.
  const baseFlags = getCommandFlags(flags, [
    '_',
    '--tag',
    '--maintainer-id',
    '--next',
    '--json',
  ]);
  const repeatable = [
    ...(tags ?? []).map(tag => `--tag ${quoteArg(tag)}`),
    ...(maintainerIds ?? []).map(id => `--maintainer-id ${quoteArg(id)}`),
  ];
  const suffix = repeatable.length > 0 ? ` ${repeatable.join(' ')}` : '';
  return `flags ls${baseFlags}${suffix} --next ${nextCursor}`;
}

// Wrap a value in single quotes only when it contains characters the shell
// would otherwise interpret, so the printed next-page command stays
// copy-pasteable for tags that include spaces or special characters. The
// cursor is base64url and therefore always shell-safe.
function quoteArg(value: string): string {
  if (/^[A-Za-z0-9_./@:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function outputJson(client: Client, flags: Flag[], next: string | null) {
  const jsonOutput = {
    flags: flags.map(flag => ({
      id: flag.id,
      slug: flag.slug,
      description: flag.description ?? null,
      kind: flag.kind,
      state: flag.state,
      variants: flag.variants,
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt,
    })),
    pagination: { next },
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
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
