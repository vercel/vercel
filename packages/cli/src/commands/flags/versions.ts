import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import {
  getFlagVersions,
  MAX_FLAG_VERSIONS_PAGE_LIMIT,
} from '../../util/flags/get-flags';
import formatTable from '../../util/format-table';
import formatDate from '../../util/format-date';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { FlagsVersionsTelemetryClient } from '../../util/telemetry/commands/flags/versions';
import {
  flagsCommand,
  versionsDiffSubcommand,
  versionsListSubcommand,
  versionsSubcommand,
} from './command';
import { formatProject } from '../../util/projects/format-project';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';
import { quoteArg } from '../../util/flags/quote-arg';
import type { FlagVersion } from '../../util/flags/types';
import {
  diffVersionData,
  formatVersionDataDiff,
  type VersionDiffChange,
} from '../../util/flags/format-version-diff';
import { type Command, help } from '../help';
import { getCommandAliases } from '..';

type LinkedFlagsProject = Extract<
  Awaited<ReturnType<typeof getLinkedFlagsProject>>,
  { status: 'linked' }
>;

const COMMAND_CONFIG = {
  list: getCommandAliases(versionsListSubcommand),
  diff: getCommandAliases(versionsDiffSubcommand),
};

export default async function versions(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsVersionsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(versionsSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args,
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetryClient.trackCliFlagHelp('flags versions', subcommandOriginal);
    output.print(
      help(
        parsedArgs.args.length > 0
          ? versionsListSubcommand
          : versionsSubcommand,
        {
          parent:
            parsedArgs.args.length > 0 ? getVersionsHelpParent() : flagsCommand,
          columns: client.stderr.columns,
        }
      )
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: getVersionsHelpParent(),
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'diff':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('flags versions', subcommandOriginal);
        printHelp(versionsDiffSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandDiff(subcommandOriginal);
      return diffVersions(client, args, telemetryClient);
    case 'list':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('flags versions', subcommandOriginal);
        printHelp(versionsListSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandList(subcommandOriginal);
      return listVersions(client, args, telemetryClient);
    default:
      telemetryClient.trackCliSubcommandList('default');
      return listVersions(client, argv, telemetryClient);
  }
}

async function listVersions(
  client: Client,
  argv: string[],
  telemetryClient: FlagsVersionsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    versionsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const limit = flags['--limit'] as number | undefined;
  const cursor = flags['--cursor'] as string | undefined;
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error(
      `Missing required argument: flag. Usage: ${getCommandName('flags versions <flag>')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionLimit(limit);
  telemetryClient.trackCliOptionCursor(cursor);
  telemetryClient.trackCliFlagJson(json);

  if (
    limit !== undefined &&
    (!Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_FLAG_VERSIONS_PAGE_LIMIT)
  ) {
    output.error(
      `The --limit option must be an integer between 1 and ${MAX_FLAG_VERSIONS_PAGE_LIMIT}.`
    );
    return 1;
  }

  const link = await resolveLinkedProject(client, projectName);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const versionsStamp = stamp();
  const environmentLabel = environment ? ` in ${environment}` : '';

  output.spinner(
    `Fetching version history for ${chalk.bold(flagArg)}${environmentLabel} in ${projectSlugLink}`
  );

  try {
    const { versions: versionList, next } = await getFlagVersions(
      client,
      project.id,
      flagArg,
      {
        environment,
        limit,
        cursor,
      }
    );
    output.stopSpinner();

    if (json) {
      outputJson(client, versionList, next);
    } else if (versionList.length === 0) {
      output.log(
        `No versions found for ${chalk.bold(flagArg)}${environmentLabel} in ${projectSlugLink} ${chalk.gray(versionsStamp())}`
      );
    } else {
      output.log(
        `${plural('version', versionList.length, true)} found for ${chalk.bold(flagArg)}${environmentLabel} in ${projectSlugLink} ${chalk.gray(versionsStamp())}`
      );
      printVersionsTable(versionList);
      if (next) {
        const nextCmd = buildNextPageCommand(flagArg, flags, next);
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

async function diffVersions(
  client: Client,
  argv: string[],
  telemetryClient: FlagsVersionsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    versionsDiffSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const revision = flags['--revision'] as number | undefined;
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error(
      `Missing required argument: flag. Usage: ${getCommandName('flags versions diff <flag> --revision <number>')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionRevision(revision);
  telemetryClient.trackCliFlagJson(json);

  if (revision === undefined || !Number.isInteger(revision) || revision < 0) {
    output.error('The --revision option must be a non-negative integer.');
    return 1;
  }

  if (revision === 0) {
    output.error('Revision 0 has no previous revision to compare.');
    return 1;
  }

  const link = await resolveLinkedProject(client, projectName);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const diffStamp = stamp();

  output.spinner(
    `Fetching version diff for ${chalk.bold(flagArg)} revision ${revision} in ${projectSlugLink}`
  );

  try {
    const { version, previousVersion, availableRevisionCount } =
      await getVersionPair(client, project.id, flagArg, revision);
    output.stopSpinner();

    if (!version) {
      output.error(
        `${formatAvailableRevisionCount(availableRevisionCount)} Revision ${revision} was not found for ${chalk.bold(flagArg)} in ${projectSlugLink}.`
      );
      return 1;
    }

    if (!previousVersion) {
      output.error(
        `${formatAvailableRevisionCount(availableRevisionCount)} Previous revision ${revision - 1} was not found for ${chalk.bold(flagArg)} in ${projectSlugLink}.`
      );
      return 1;
    }

    if (json) {
      outputDiffJson(
        client,
        flagArg,
        version,
        previousVersion,
        diffVersionData(previousVersion.data, version.data)
      );
    } else {
      printVersionDiff({
        flagArg,
        projectSlugLink,
        version,
        previousVersion,
        diffStamp,
      });
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

async function resolveLinkedProject(
  client: Client,
  projectName?: string
): Promise<LinkedFlagsProject | number> {
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
  return link;
}

async function getVersionPair(
  client: Client,
  projectId: string,
  flagArg: string,
  revision: number
): Promise<{
  version?: FlagVersion;
  previousVersion?: FlagVersion;
  availableRevisionCount: number;
}> {
  let cursor: string | undefined;
  let version: FlagVersion | undefined;
  let previousVersion: FlagVersion | undefined;
  const availableRevisions = new Set<number>();

  do {
    const result = await getFlagVersions(client, projectId, flagArg, {
      limit: MAX_FLAG_VERSIONS_PAGE_LIMIT,
      cursor,
    });

    for (const candidate of result.versions) {
      availableRevisions.add(candidate.revision);
    }

    version ??= result.versions.find(
      candidate => candidate.revision === revision
    );
    previousVersion ??= result.versions.find(
      candidate => candidate.revision === revision - 1
    );

    if (version && previousVersion) {
      break;
    }

    cursor = result.next ?? undefined;
  } while (cursor);

  return {
    version,
    previousVersion,
    availableRevisionCount: availableRevisions.size,
  };
}

function formatAvailableRevisionCount(count: number): string {
  return `Only ${plural('revision', count, true)} ${count === 1 ? 'is' : 'are'} available.`;
}

function outputJson(
  client: Client,
  versions: FlagVersion[],
  next: string | null
) {
  const jsonOutput = {
    versions: versions.map(version => ({
      ...formatVersionSummary(version),
      data: version.data,
    })),
    pagination: { next },
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function outputDiffJson(
  client: Client,
  flagArg: string,
  version: FlagVersion,
  previousVersion: FlagVersion,
  changes: VersionDiffChange[]
) {
  const jsonOutput = {
    flag: flagArg,
    revision: version.revision,
    previousRevision: previousVersion.revision,
    version: formatVersionSummary(version),
    previousVersion: formatVersionSummary(previousVersion),
    changes,
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function formatVersionSummary(version: FlagVersion) {
  return {
    id: version.id,
    flagId: version.flagId,
    revision: version.revision,
    author: getVersionAuthor(version),
    createdBy: version.createdBy ?? null,
    message: getVersionMessage(version),
    createdAt: version.createdAt,
    changedEnvironments: version.changedEnvironments,
  };
}

function printVersionsTable(versions: FlagVersion[]) {
  const headers = [
    'Revision',
    'Author',
    'Message',
    'Timestamp',
    'Changed Environments',
  ];

  const rows = versions.map(version => [
    String(version.revision),
    getVersionAuthor(version) ?? chalk.gray('-'),
    getVersionMessage(version) ?? chalk.gray('-'),
    formatDate(version.createdAt),
    formatChangedEnvironments(version.changedEnvironments),
  ]);

  const table = formatTable(
    headers,
    ['r', 'l', 'l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}

function printVersionDiff({
  flagArg,
  projectSlugLink,
  version,
  previousVersion,
  diffStamp,
}: {
  flagArg: string;
  projectSlugLink: string;
  version: FlagVersion;
  previousVersion: FlagVersion;
  diffStamp: ReturnType<typeof stamp>;
}) {
  output.log(
    `Changes in revision ${chalk.bold(String(version.revision))} for ${chalk.bold(flagArg)} compared with revision ${chalk.bold(String(previousVersion.revision))} in ${projectSlugLink} ${chalk.gray(diffStamp())}`
  );
  output.print(
    `\n  ${chalk.dim('Author:')} ${getVersionAuthor(version) ?? chalk.gray('-')}\n`
  );
  output.print(
    `  ${chalk.dim('Message:')} ${getVersionMessage(version) ?? chalk.gray('-')}\n`
  );
  output.print(
    `  ${chalk.dim('Changed environments:')} ${formatChangedEnvironments(version.changedEnvironments)}\n`
  );

  const formattedDiff = formatVersionDataDiff(
    previousVersion.data,
    version.data
  );
  if (formattedDiff.length === 0) {
    output.print(`\n  ${chalk.gray('No changes detected.')}\n\n`);
    return;
  }

  output.print(`\n${formattedDiff}\n\n`);
}

function formatChangedEnvironments(environments: string[]): string {
  if (environments.length === 0) {
    return chalk.gray('-');
  }
  return environments.join(', ');
}

function getVersionAuthor(version: FlagVersion): string | null {
  return version.metadata?.creator?.name ?? version.createdBy ?? null;
}

function getVersionMessage(version: FlagVersion): string | null {
  if (version.message) {
    return version.message;
  }

  if (version.revision === 0) {
    return 'Flag created';
  }

  return null;
}

function getVersionsHelpParent(): Command {
  return {
    ...versionsSubcommand,
    name: 'flags versions',
  };
}

function buildNextPageCommand(
  flagArg: string,
  flags: { [key: string]: unknown },
  nextCursor: string
): string {
  const environment = flags['--environment'] as string | undefined;
  const baseFlags = getCommandFlags(flags, [
    '_',
    '--cursor',
    '--environment',
    '--json',
  ]);
  const environmentFlag = environment
    ? ` --environment ${quoteArg(environment)}`
    : '';
  return `flags versions ${quoteArg(flagArg)}${baseFlags}${environmentFlag} --cursor ${quoteArg(nextCursor)}`;
}
