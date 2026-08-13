import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { AccessGroupMembersTelemetryClient } from '../../util/telemetry/commands/access-group/members';
import updateAccessGroup from '../../util/access-group/update-access-group';
import getTeamMembers from '../../util/access-group/get-team-members';
import { resolveMemberId } from '../../util/access-group/resolve-member';
import { handleAccessGroupError } from '../../util/access-group/error';
import { membersAddSubcommand } from './command';

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupMembersTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    membersAddSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const [group, member] = parsedArgs.args;
  if (!group || !member) {
    output.error(
      `Please provide an access group and a member. See ${getCommandName(
        'access-group members add <group> <member>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentGroup(group);
  telemetry.trackCliArgumentMember(member);

  const { contextName, team } = await getScope(client);
  if (!team) {
    output.error('Access groups are only available on a team scope.');
    return 1;
  }

  let uid: string | undefined;
  try {
    const teamMembers = await getTeamMembers(client, team.id);
    uid = resolveMemberId(teamMembers, member);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (!uid) {
    output.error(
      `Could not find a team member matching ${chalk.bold(
        member
      )}. Pass a user id, email, or username of a member of ${chalk.bold(
        contextName
      )}.`
    );
    return 1;
  }

  try {
    await updateAccessGroup(client, group, { membersToAdd: [uid] });
  } catch (err) {
    return handleAccessGroupError(err);
  }

  output.success(
    `Member ${chalk.bold(member)} added to access group ${chalk.bold(group)}`
  );
  return 0;
}
