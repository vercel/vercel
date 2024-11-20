import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import { NODE_VERSIONS } from '@vercel/build-utils';
import { ProjectListTelemetryClient } from '../../util/telemetry/commands/project/list';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';
import getScope from '../../util/get-scope';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';

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
    handleError(error);
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

  let projectsUrl = '/v9/projects?limit=20';

  const deprecated = opts['--update-required'] || false;
  telemetryClient.trackCliFlagUpdateRequired(deprecated);
  if (deprecated) {
    projectsUrl += `&deprecated=${deprecated}`;
  }

  const next = opts['--next'];
  telemetryClient.trackCliOptionNext(next);
  if (next) {
    projectsUrl += `&until=${next}`;
  }

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

  if (deprecated) {
    const upcomingDeprecationVersionsList = [];

    for (const nodeVersion of NODE_VERSIONS) {
      if (
        nodeVersion.discontinueDate &&
        nodeVersion.discontinueDate.valueOf() > Date.now()
      ) {
        upcomingDeprecationVersionsList.push(nodeVersion.range);
      }
    }

    output.warn(
      `The following Node.js versions will be deprecated soon: ${upcomingDeprecationVersionsList.join(
        ', '
      )}. Please upgrade your projects immediately.`
    );
    output.log(
      'For more information visit: https://vercel.com/docs/functions/serverless-functions/runtimes/node-js#node.js-version'
    );
  }

  output.log(
    `${
      projectList.length > 0 ? 'Projects' : 'No projects'
    } found under ${chalk.bold(contextName)} ${
      deprecated ? 'that are using a deprecated Node.js version' : '\b'
    } ${chalk.gray(`[${elapsed}]`)}`
  );

  if (projectList.length > 0) {
    const tablePrint = table(
      [
        ['Project Name', 'Latest Production URL', 'Updated'].map(header =>
          chalk.bold(chalk.cyan(header))
        ),
        ...projectList.flatMap(project => [
          [
            chalk.bold(project.name),
            getLatestProdUrl(project),
            chalk.gray(ms(Date.now() - project.updatedAt)),
          ],
        ]),
      ],
      { hsep: 3 }
    ).replace(/^/gm, '  ');
    output.print(`\n${tablePrint}\n\n`);

    if (pagination && pagination.count === 20) {
      const flags = getCommandFlags(opts, ['_', '--next', '-N', '-d', '-y']);
      const nextCmd = `project ls${flags} --next ${pagination.next}`;
      output.log(`To display the next page, run ${getCommandName(nextCmd)}`);
    }
  }
  return 0;
}

function getLatestProdUrl(project: Project): string {
  const alias = project.targets?.production?.alias?.[0];
  if (alias) return `https://${alias}`;
  return '--';
}
