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
import { updateAccessGroupProject } from '../../util/access-group/mutate-access-group-project';
import { handleAccessGroupError } from '../../util/access-group/error';
import {
  ACCESS_GROUP_PROJECT_ROLES,
  type AccessGroupProjectRole,
} from '../../util/access-group/types';
import { projectsUpdateSubcommand } from './command';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupProjectsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    projectsUpdateSubcommand.options
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
        'access-group projects update <group> <project> --role <role>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentGroup(group);
  telemetry.trackCliArgumentProject(project);

  const role = flags['--role'];
  telemetry.trackCliOptionRole(role);

  if (!role) {
    output.error(
      `Please provide a role with \`--role\`. Valid roles: ${ACCESS_GROUP_PROJECT_ROLES.join(
        ', '
      )}.`
    );
    return 1;
  }
  if (!(ACCESS_GROUP_PROJECT_ROLES as readonly string[]).includes(role)) {
    output.error(
      `Invalid role "${role}". Valid roles: ${ACCESS_GROUP_PROJECT_ROLES.join(
        ', '
      )}.`
    );
    return 1;
  }

  const resolved = await getProjectByNameOrId(client, project);
  if (resolved instanceof ProjectNotFound) {
    output.error(`Project ${chalk.bold(project)} not found.`);
    return 1;
  }

  try {
    await updateAccessGroupProject(
      client,
      group,
      resolved.id,
      role as AccessGroupProjectRole
    );
  } catch (err) {
    return handleAccessGroupError(err);
  }

  output.success(
    `Project ${chalk.bold(project)} in access group ${chalk.bold(
      group
    )} updated to role ${chalk.bold(role)}`
  );
  return 0;
}
