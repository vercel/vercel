import chalk from 'chalk';
import output from '../../output-manager';
import { inspectSubcommand, targetCommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { formatEnvironment } from '../../util/target/format-environment';
import { validateJsonOutput } from '../../util/output-format';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import formatDate from '../../util/format-date';
import table from '../../util/output/table';
import { isAPIError } from '../../util/errors-ts';
import { TargetInspectTelemetryClient } from '../../util/telemetry/commands/target/inspect';
import type Client from '../../util/client';
import type {
  CustomEnvironment,
  CustomEnvironmentBranchMatcher,
} from '@vercel-internals/types';

function formatBranchMatcher(
  branchMatcher?: CustomEnvironmentBranchMatcher
): string {
  if (branchMatcher?.type === 'equals') {
    return `equals ${branchMatcher.pattern}`;
  } else if (branchMatcher?.type === 'startsWith') {
    return `starts with ${branchMatcher.pattern}`;
  } else if (branchMatcher?.type === 'endsWith') {
    return `ends with ${branchMatcher.pattern}`;
  }
  return chalk.dim('No branch configuration');
}

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const { cwd } = client;

  const telemetry = new TargetInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        'target inspect <name>'
      )}`
    );
    return 2;
  }

  const [nameOrId] = args;
  telemetry.trackCliArgumentName(nameOrId);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const projectName = flags['--project'];
  telemetry.trackCliOptionProject(projectName);

  const autoConfirm = !!flags['--yes'];
  telemetry.trackCliFlagYes(flags['--yes']);

  const link = await ensureLink(targetCommand.name, client, cwd, {
    autoConfirm,
    projectName,
    failIfNotFound: Boolean(projectName),
  });
  if (typeof link === 'number') {
    return link;
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  output.spinner(
    `Fetching custom environment ${chalk.bold(nameOrId)} for ${projectSlugLink}`
  );

  const url = `/projects/${encodeURIComponent(
    link.project.id
  )}/custom-environments/${encodeURIComponent(nameOrId)}`;

  let environment: CustomEnvironment;
  try {
    environment = (await client.fetch(url, {
      method: 'GET',
      accountId: link.org.id,
    })) as CustomEnvironment;
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 404) {
      output.error(
        `Custom environment ${chalk.bold(
          nameOrId
        )} was not found under ${projectSlugLink}.`
      );
      return 1;
    }
    printError(error);
    return 1;
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          id: environment.id,
          slug: environment.slug,
          type: environment.type,
          description: environment.description,
          branchMatcher: environment.branchMatcher,
          domains: environment.domains,
          createdAt: environment.createdAt,
          updatedAt: environment.updatedAt,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log(
    `Custom environment ${formatEnvironment(
      link.org.slug,
      link.project.name,
      environment
    )} under ${projectSlugLink}`
  );
  client.stdout.write(formatEnvironmentDetails(environment));

  return 0;
}

function formatEnvironmentDetails(environment: CustomEnvironment): string {
  const rows: string[][] = [
    ['ID', environment.id],
    ['Name', environment.slug],
    ['Type', environment.type],
    ['Branch Matcher', formatBranchMatcher(environment.branchMatcher)],
  ];

  if (environment.description) {
    rows.push(['Description', environment.description]);
  }

  const domains = (environment.domains ?? [])
    .map(domain => (domain as { name?: string }).name)
    .filter((name): name is string => Boolean(name));
  rows.push(['Domains', domains.length ? domains.join(', ') : chalk.dim('-')]);

  rows.push(['Created', formatDate(environment.createdAt)]);
  rows.push(['Updated', formatDate(environment.updatedAt)]);

  return `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(
    /^(.*)/gm,
    '  $1'
  )}\n`;
}
