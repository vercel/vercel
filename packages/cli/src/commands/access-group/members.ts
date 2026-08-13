import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './members-list';
import { membersSubcommand, membersListSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AccessGroupMembersTelemetryClient } from '../../util/telemetry/commands/access-group/members';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  list: getCommandAliases(membersListSubcommand),
};

export default async function members(client: Client): Promise<number> {
  const telemetry = new AccessGroupMembersTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(membersSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, subcommandOriginal, args } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('access-group members');
    output.print(help(membersSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: membersSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (needHelp) {
    telemetry.trackCliFlagHelp('access-group members', subcommandOriginal);
    printHelp(membersListSubcommand);
    return 2;
  }
  telemetry.trackCliSubcommandList(subcommandOriginal);
  return list(client, args);
}
