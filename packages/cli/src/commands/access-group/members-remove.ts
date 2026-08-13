import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { AccessGroupMembersTelemetryClient } from '../../util/telemetry/commands/access-group/members';
import updateAccessGroup from '../../util/access-group/update-access-group';
import getAccessGroupMembers from '../../util/access-group/get-access-group-members';
import { resolveMemberId } from '../../util/access-group/resolve-member';
import { handleAccessGroupError } from '../../util/access-group/error';
import { membersRemoveSubcommand } from './command';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupMembersTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    membersRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const [group, member] = parsedArgs.args;
  if (!group || !member) {
    output.error(
      `Please provide an access group and a member. See ${getCommandName(
        'access-group members rm <group> <member>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentGroup(group);
  telemetry.trackCliArgumentMember(member);
  telemetry.trackCliFlagYes(flags['--yes']);

  const skipConfirmation = flags['--yes'] || false;

  if (client.nonInteractive && !skipConfirmation) {
    output.error(
      'In non-interactive mode, `--yes` is required to remove a member.'
    );
    return 1;
  }

  let uid: string | undefined;
  try {
    const members = await getAccessGroupMembers(client, group);
    uid = resolveMemberId(members, member);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (!uid) {
    output.error(
      `Could not find a member matching ${chalk.bold(
        member
      )} in access group ${chalk.bold(group)}.`
    );
    return 1;
  }

  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Are you sure you want to remove ${chalk.bold(
        member
      )} from access group ${chalk.bold(group)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    await updateAccessGroup(client, group, { membersToRemove: [uid] });
  } catch (err) {
    return handleAccessGroupError(err);
  }

  output.success(
    `Member ${chalk.bold(member)} removed from access group ${chalk.bold(group)}`
  );
  return 0;
}
