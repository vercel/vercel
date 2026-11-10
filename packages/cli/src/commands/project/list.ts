import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { ProjectListTelemetryClient } from '../../util/telemetry/commands/project/list';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { listSubcommand } from './command';
import { getTypedOptionName, parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getContextName } from '../../util/get-scope';
import {
  getPaginationOpts,
  InvalidNextError,
} from '../../util/get-pagination-opts';
import { printNextPageCommand } from '../../util/pagination';
import {
  listPausedProjects,
  PAUSED_PROJECTS_INCOMPLETE,
} from '../../util/projects/list-paused-projects';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  getRenamedOption,
  reportRenamedOptionError,
  type DeprecatedOptionWarning,
} from '../../util/renamed-option';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';

// Constants
const TABLE_HEADERS = [
  'Project Name',
  'Latest Production URL',
  'Updated',
  'Node Version',
  'Status',
];
const PAGINATION_FLAGS_TO_EXCLUDE = [
  '_',
  '--next',
  '-N',
  '-d',
  '-y',
  '--json',
  '--format',
];
const DEFAULT_PROJECTS_LIMIT = 20;

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new ProjectListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project ls')}`
      )}`
    );
    return 2;
  }

  const formatResult = validateJsonOutput(opts);
  const query = getRenamedOption(opts, '--query', '--filter', {
    json: formatResult.valid && formatResult.jsonOutput,
    typedName: getTypedOptionName(argv, flagsSpecification, '--filter'),
  });
  if ('error' in query) {
    return reportRenamedOptionError(client, query.error, {
      json: formatResult.valid && formatResult.jsonOutput,
    });
  }

  const start = Date.now();

  const contextName = await getContextName(client, {
    resolveLocalScope: true,
  });
  output.spinner(`Fetching projects in ${chalk.bold(contextName)}`);

  // Process flags and build URL
  const flags = processFlags(opts, telemetryClient, query.value);
  if ('error' in flags) {
    output.stopSpinner();
    output.error(flags.error);
    return flags.exitCode;
  }
  // The next-page command teaches `--query`.
  if (opts['--filter'] !== undefined) {
    opts['--query'] = opts['--filter'];
    delete opts['--filter'];
  }
  const {
    projects: projectList,
    pagination,
    incomplete,
  } = await fetchProjects(client, flags);

  output.stopSpinner();

  const elapsed = ms(Date.now() - start);

  if (flags.json) {
    outputJson(client, projectList, {
      pagination,
      contextName,
      elapsed,
      deprecated: flags.deprecated,
      incomplete,
      deprecation: query.warning,
    });
  } else {
    outputTable(projectList, {
      contextName,
      elapsed,
      deprecated: flags.deprecated,
      paused: flags.paused,
      opts,
      pagination,
    });
    if (incomplete) {
      output.warning(PAUSED_PROJECTS_INCOMPLETE);
    }
    // `resume --all` takes every paused project, so offer it only when no
    // other filter narrowed the list.
    if (
      flags.paused &&
      projectList.length > 0 &&
      !flags.filter &&
      !flags.deprecated
    ) {
      output.print(
        `\n  Resume them all:\n    ${buildCommandWithGlobalFlags(
          client.argv,
          'project resume --all'
        )}\n`
      );
    }
  }

  return 0;
}

// Helper function to process flags and track telemetry
function processFlags(
  opts: Record<string, any>,
  telemetryClient: ProjectListTelemetryClient,
  filter: string | undefined
):
  | {
      deprecated: boolean;
      paused: boolean;
      next?: number;
      json: boolean;
      filter?: string;
      limit?: number;
    }
  | { error: string; exitCode: number } {
  const deprecated = opts['--update-required'] || false;
  const paused = opts['--paused'] || false;
  const limit = opts['--limit'];
  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    return { error: formatResult.error, exitCode: 1 };
  }
  const json = formatResult.jsonOutput;

  telemetryClient.trackCliFlagUpdateRequired(deprecated);
  telemetryClient.trackCliFlagPaused(paused);
  telemetryClient.trackCliOptionNext(opts['--next']);
  telemetryClient.trackCliOptionLimit(limit);
  telemetryClient.trackCliOptionFormat(opts['--format']);
  telemetryClient.trackCliFlagJson(opts['--json']);
  telemetryClient.trackCliOptionQuery(opts['--query']);
  telemetryClient.trackCliOptionFilter(opts['--filter']);

  let next: number | undefined;
  try {
    [next] = getPaginationOpts(opts);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      exitCode: error instanceof InvalidNextError ? 2 : 1,
    };
  }

  return { deprecated, paused, next, json, filter, limit };
}

async function fetchProjects(
  client: Client,
  flags: {
    deprecated: boolean;
    paused: boolean;
    next?: number;
    filter?: string;
    limit?: number;
  }
): Promise<{
  projects: Project[];
  pagination: { count: number; next: number | null };
  incomplete?: boolean;
}> {
  if (flags.paused) {
    const { projects, next, incomplete } = await listPausedProjects(client, {
      limit: flags.limit ?? DEFAULT_PROJECTS_LIMIT,
      until: flags.next,
      search: flags.filter,
      deprecated: flags.deprecated,
    });
    return {
      projects,
      pagination: { count: projects.length, next },
      incomplete,
    };
  }
  return client.fetch(buildProjectsUrl(flags), { method: 'GET' });
}

// Helper function to build projects URL
function buildProjectsUrl(flags: {
  deprecated: boolean;
  next?: number;
  filter?: string;
  limit?: number;
}) {
  const query = new URLSearchParams({
    limit: String(flags.limit ?? DEFAULT_PROJECTS_LIMIT),
    // The list never reads `latestDeployments`. The API still fills in
    // `targets`, which the Latest Production URL column comes from.
    latestDeployments: '0',
  });

  if (flags.deprecated) {
    query.set('deprecated', String(flags.deprecated));
  }
  if (flags.next) {
    query.set('until', String(flags.next));
  }
  if (flags.filter) {
    query.set('search', flags.filter);
  }

  return `/v9/projects?${query}`;
}

// Helper function to create project JSON representation
function createProjectJson(project: Project, deprecated: boolean) {
  return {
    name: project.name,
    id: project.id,
    latestProductionUrl: getLatestProdUrl(project),
    updatedAt: project.updatedAt,
    nodeVersion: project.nodeVersion ?? null,
    deprecated: deprecated,
    paused: project.paused ?? false,
  };
}

// Helper function for JSON output
function outputJson(
  client: Client,
  projectList: Project[],
  metadata: {
    pagination: any;
    contextName: string;
    elapsed: string;
    deprecated: boolean;
    incomplete?: boolean;
    deprecation?: DeprecatedOptionWarning;
  }
) {
  const warnings = [
    ...(metadata.deprecation ? [metadata.deprecation] : []),
    ...(metadata.incomplete
      ? [
          {
            reason: AGENT_REASON.INCOMPLETE_RESULTS,
            message: PAUSED_PROJECTS_INCOMPLETE,
          },
        ]
      : []),
  ];
  const jsonOutput = {
    projects: projectList.map(project =>
      createProjectJson(project, metadata.deprecated)
    ),
    pagination: metadata.pagination,
    contextName: metadata.contextName,
    elapsed: metadata.elapsed,
    ...(warnings.length > 0 && { warnings }),
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

// Helper function for table output
function outputTable(
  projectList: Project[],
  options: {
    contextName: string;
    elapsed: string;
    deprecated: boolean;
    paused: boolean;
    opts: Record<string, any>;
    pagination: { count: number; next: number | null };
  }
) {
  const { contextName, elapsed, deprecated, paused, opts, pagination } =
    options;
  const qualifiers = [
    paused && 'paused',
    deprecated && 'using a deprecated Node.js version',
  ].filter(Boolean);

  output.log(
    `${
      projectList.length > 0 ? 'Projects' : 'No projects'
    } found under ${chalk.bold(contextName)} ${
      qualifiers.length > 0 ? `that are ${qualifiers.join(' and ')}` : '\b'
    } ${chalk.gray(`[${elapsed}]`)}`
  );

  if (projectList.length > 0) {
    printProjectsTable(projectList);
    printPaginationInstructions(opts, pagination);
  }
}

// Helper function to print projects table
function printProjectsTable(projectList: Project[]) {
  const tablePrint = table(
    [
      TABLE_HEADERS.map(header => chalk.bold(chalk.cyan(header))),
      ...projectList.flatMap(project => [
        [
          chalk.bold(project.name),
          getLatestProdUrl(project),
          chalk.gray(ms(Date.now() - project.updatedAt)),
          project.nodeVersion ?? '',
          project.paused ? 'Paused' : '',
        ],
      ]),
    ],
    { hsep: 3 }
  ).replace(/^/gm, '  ');
  output.print(`\n${tablePrint}\n\n`);
}

// Helper function to print pagination instructions
function printPaginationInstructions(
  opts: Record<string, any>,
  pagination: { count: number; next: number | null }
) {
  if (pagination?.next) {
    const flags = getCommandFlags(opts, PAGINATION_FLAGS_TO_EXCLUDE);
    printNextPageCommand(
      getCommandNamePlain(`project ls${flags} --next ${pagination.next}`)
    );
  }
}

function getLatestProdUrl(project: Project): string {
  const alias = project.targets?.production?.alias?.[0];
  if (alias) return `https://${alias}`;
  return '--';
}
