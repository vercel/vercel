import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { AccessGroupTelemetryClient } from '../../util/telemetry/commands/access-group';
import getAccessGroup from '../../util/access-group/get-access-group';
import deleteAccessGroup from '../../util/access-group/delete-access-group';
import { handleAccessGroupError } from '../../util/access-group/error';
import { removeSubcommand } from './command';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const idOrName = parsedArgs.args[0];
  if (!idOrName) {
    output.error(
      `Please provide an access group id or name. See ${getCommandName(
        'access-group rm <idOrName>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentIdOrName(idOrName);
  telemetry.trackCliFlagYes(flags['--yes']);

  const skipConfirmation = flags['--yes'] || false;

  if (client.nonInteractive && !skipConfirmation) {
    output.error(
      'In non-interactive mode, `--yes` is required to remove an access group.'
    );
    return 1;
  }

  // Resolve the group first so the confirmation names the real target.
  let accessGroup;
  try {
    accessGroup = await getAccessGroup(client, idOrName);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Are you sure you want to remove the access group ${chalk.bold(
        accessGroup.name
      )} (${accessGroup.accessGroupId})?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    await deleteAccessGroup(client, accessGroup.accessGroupId);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  output.success(
    `Access group ${chalk.bold(accessGroup.name)} (${
      accessGroup.accessGroupId
    }) removed`
  );
  return 0;
}
