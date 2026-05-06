import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import ls from './ls';
import add from './add';
import rm from './rm';
import {
  tokensCommand,
  listSubcommand,
  addSubcommand,
  removeSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { TokensTelemetryClient } from '../../util/telemetry/commands/tokens';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  add: ['add', 'create'],
  remove: ['rm', 'remove', 'delete'],
  ls: ['ls', 'list'],
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(tokensCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new TokensTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('tokens');
    output.print(help(tokensCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command): number {
    output.print(
      help(command, { parent: tokensCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('tokens', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('tokens', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('tokens', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
