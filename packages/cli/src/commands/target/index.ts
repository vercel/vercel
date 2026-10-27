import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { type Command, help } from '../help';
import list from './list';
import { listSubcommand, targetCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { TargetTelemetryClient } from '../../util/telemetry/commands/target';
import { getCommandAliases } from '..';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(targetCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  const { telemetryEventStore } = client;
  const telemetry = new TargetTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const commandName = parsedArgs.args[0];
  if (commandName === 'target' || commandName === 'targets') {
    warnDeprecatedSubcommand(client, commandName, targetCommand.name);
  }

  parsedArgs.args = parsedArgs.args.slice(1);
  const subcommand = parsedArgs.args[0];
  const args = parsedArgs.args.slice(1);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('environments');
    output.print(
      help(targetCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: targetCommand,
        columns: client.stderr.columns,
      })
    );
  }

  // `list` is the default action, so options without a subcommand belong to
  // it: `vercel environments --json` lists environments as JSON.
  if (subcommand === undefined || subcommand.startsWith('-')) {
    if (needHelp) {
      telemetry.trackCliFlagHelp('environments', 'list');
      printHelp(listSubcommand);
      return 0;
    }
    telemetry.trackCliSubcommandList('default');
    return await list(client, parsedArgs.args);
  }

  switch (subcommand) {
    case 'ls':
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('environments', 'list');
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommand);
      return await list(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(targetCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
