import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { AccessGroupMembersTelemetryClient } from '../../util/telemetry/commands/access-group/members';
import getAccessGroupMembers from '../../util/access-group/get-access-group-members';
import { formatAccessGroupMembersTable } from '../../util/access-group/format';
import { handleAccessGroupError } from '../../util/access-group/error';
import { membersListSubcommand } from './command';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupMembersTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    membersListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);

  const group = parsedArgs.args[0];
  if (!group) {
    output.error(
      `Please provide an access group id or name. See ${getCommandName(
        'access-group members ls <group>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentGroup(group);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const lsStamp = stamp();

  let members;
  try {
    members = await getAccessGroupMembers(client, group);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ members }, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.log(
    `${
      members.length > 0 ? 'Members' : 'No members'
    } found in ${chalk.bold(group)} under ${chalk.bold(contextName)} ${lsStamp()}`
  );

  if (members.length > 0) {
    client.stdout.write(formatAccessGroupMembersTable(members));
  }

  return 0;
}
