import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { AccessGroupProjectsTelemetryClient } from '../../util/telemetry/commands/access-group/projects';
import { deleteAccessGroupProject } from '../../util/access-group/mutate-access-group-project';
import { handleAccessGroupError } from '../../util/access-group/error';
import { projectsRemoveSubcommand } from './command';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupProjectsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    projectsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const [group, project] = parsedArgs.args;
  if (!group || !project) {
    output.error(
      `Please provide an access group and a project. See ${getCommandName(
        'access-group projects rm <group> <project>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentGroup(group);
  telemetry.trackCliArgumentProject(project);
  telemetry.trackCliFlagYes(flags['--yes']);

  const skipConfirmation = flags['--yes'] || false;

  if (client.nonInteractive && !skipConfirmation) {
    output.error(
      'In non-interactive mode, `--yes` is required to remove a project.'
    );
    return 1;
  }

  const resolved = await getProjectByNameOrId(client, project);
  if (resolved instanceof ProjectNotFound) {
    output.error(`Project ${chalk.bold(project)} not found.`);
    return 1;
  }

  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Are you sure you want to remove ${chalk.bold(
        project
      )} from access group ${chalk.bold(group)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    await deleteAccessGroupProject(client, group, resolved.id);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  output.success(
    `Project ${chalk.bold(project)} removed from access group ${chalk.bold(
      group
    )}`
  );
  return 0;
}
