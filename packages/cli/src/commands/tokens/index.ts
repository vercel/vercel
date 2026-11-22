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
import { getCommandAliases } from '..';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { TokensTelemetryClient } from '../../util/telemetry/commands/tokens';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  add: ['add', 'create'],
  revoke: getCommandAliases(removeSubcommand),
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
    return 2;
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
    output.print(
      help(tokensCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command): number {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: tokensCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('tokens', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(client, 'tokens add', 'tokens create');
      }
      return add(client, args);
    case 'revoke':
      if (needHelp) {
        telemetry.trackCliFlagHelp('tokens', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRevoke(subcommandOriginal);
      if (subcommandOriginal !== 'revoke') {
        warnDeprecatedSubcommand(
          client,
          `tokens ${subcommandOriginal}`,
          'tokens revoke'
        );
      }
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
