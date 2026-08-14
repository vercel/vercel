import chalk from 'chalk';
import ms from 'ms';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { ProjectRenameTelemetryClient } from '../../util/telemetry/commands/project/rename';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { renameSubcommand } from './command';

export default async function rename(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new ProjectRenameTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(renameSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  if (args.length !== 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project rename <name> <new-name>')}`
      )}`
    );
    return 2;
  }

  const [projectNameOrId, newName] = args;
  telemetryClient.trackCliArgumentName(projectNameOrId);
  telemetryClient.trackCliArgumentNewName(newName);

  const project = await getProjectByNameOrId(client, projectNameOrId);
  if (project instanceof ProjectNotFound) {
    output.error('No such project exists');
    return 1;
  }

  const start = Date.now();

  let renamedProject: Project;
  try {
    renamedProject = await client.fetch<Project>(
      `/v9/projects/${encodeURIComponent(project.id)}`,
      {
        method: 'PATCH',
        body: { name: newName },
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 409) {
      output.error(`A project named "${newName}" already exists`);
      return 1;
    }
    if (isAPIError(err) && err.status === 403) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const elapsed = ms(Date.now() - start);
  output.log(
    `${chalk.cyan('Success!')} Project ${chalk.bold(
      project.name
    )} renamed to ${chalk.bold(renamedProject.name)} ${chalk.gray(
      `[${elapsed}]`
    )}`
  );
  return 0;
}
