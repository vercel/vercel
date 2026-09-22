import type Client from '../../util/client';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import output from '../../output-manager';
import { ContactsTelemetryClient } from '../../util/telemetry/commands/connex/contacts';
import { getCommandAliases } from '..';
import {
  connexCommand,
  contactsAddSubcommand,
  contactsSubcommand,
} from './command';
import add from './contacts-add';

const COMMAND_CONFIG = {
  add: getCommandAliases(contactsAddSubcommand),
};

export async function contacts(client: Client): Promise<number> {
  const telemetry = new ContactsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(contactsSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    subcommand,
    subcommandOriginal,
    args: subArgs,
  } = getSubcommand(parsedArgs.args, COMMAND_CONFIG);
  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('connect contacts');
    output.print(
      help(contactsSubcommand, {
        parent: connexCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: contactsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('connect contacts', subcommandOriginal);
        printHelp(contactsAddSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(contactsSubcommand, {
          parent: connexCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
