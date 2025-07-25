import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import { ProjectListTelemetryClient } from '../../util/telemetry/commands/project/list';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';

// Constants
const TABLE_HEADERS = [
  'Project Name',
  'Latest Production URL',
  'Updated',
  'Node Version',
];
const PAGINATION_FLAGS_TO_EXCLUDE = ['_', '--next', '-N', '-d', '-y', '--json'];
const BASE_PROJECTS_URL = '/v9/projects?limit=20';

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
    return 1;
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

  const start = Date.now();

  const { contextName } = await getScope(client);
  output.spinner(`Fetching projects in ${chalk.bold(contextName)}`);

  // Process flags and build URL
  const flags = processFlags(opts, telemetryClient);
  const projectsUrl = buildProjectsUrl(flags);

  const {
    projects: projectList,
    pagination,
  }: {
    projects: Project[];
    pagination: { count: number; next: number };
  } = await client.fetch(projectsUrl, {
    method: 'GET',
  });

  output.stopSpinner();

  const elapsed = ms(Date.now() - start);

  if (flags.json) {
    outputJson(client, projectList, {
      pagination,
      contextName,
      elapsed,
      deprecated: flags.deprecated,
    });
  } else {
    outputTable(projectList, {
      contextName,
      elapsed,
      deprecated: flags.deprecated,
      opts,
      pagination,
    });
  }

  return 0;
}

// Helper function to process flags and track telemetry
function processFlags(
  opts: Record<string, any>,
  telemetryClient: ProjectListTelemetryClient
) {
  const deprecated = opts['--update-required'] || false;
  const next = opts['--next'];
  const json = opts['--json'] || false;

  telemetryClient.trackCliFlagUpdateRequired(deprecated);
  telemetryClient.trackCliOptionNext(next);
  telemetryClient.trackCliFlagJson(json);

  return { deprecated, next, json };
}

// Helper function to build projects URL
function buildProjectsUrl(flags: { deprecated: boolean; next?: number }) {
  let url = BASE_PROJECTS_URL;

  if (flags.deprecated) {
    url += `&deprecated=${flags.deprecated}`;
  }
  if (flags.next) {
    url += `&until=${flags.next}`;
  }

  return url;
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
  }
) {
  const jsonOutput = {
    projects: projectList.map(project =>
      createProjectJson(project, metadata.deprecated)
    ),
    pagination: metadata.pagination,
    contextName: metadata.contextName,
    elapsed: metadata.elapsed,
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
    opts: Record<string, any>;
    pagination: { count: number; next: number };
  }
) {
  const { contextName, elapsed, deprecated, opts, pagination } = options;

  output.log(
    `${
      projectList.length > 0 ? 'Projects' : 'No projects'
    } found under ${chalk.bold(contextName)} ${
      deprecated ? 'that are using a deprecated Node.js version' : '\b'
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
  pagination: { count: number; next: number }
) {
  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, PAGINATION_FLAGS_TO_EXCLUDE);
    const nextCmd = `project ls${flags} --next ${pagination.next}`;
    output.log(`To display the next page, run ${getCommandName(nextCmd)}`);
  }
}

function getLatestProdUrl(project: Project): string {
  const alias = project.targets?.production?.alias?.[0];
  if (alias) return `https://${alias}`;
  return '--';
}
