import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import init from './init';
import connect from './connect';
import { byocCommand, initSubcommand, connectSubcommand } from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ByocTelemetryClient } from '../../util/telemetry/commands/byoc';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  init: ['init'],
  connect: ['connect'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(byocCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new ByocTelemetryClient({
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
    telemetry.trackCliFlagHelp('byoc');
    output.print(help(byocCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: byocCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'init':
      if (needHelp) {
        telemetry.trackCliFlagHelp('byoc', subcommandOriginal);
        return printHelp(initSubcommand);
      }
      telemetry.trackCliSubcommandInit(subcommandOriginal);
      return init(client, args);
    case 'connect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('byoc', subcommandOriginal);
        return printHelp(connectSubcommand);
      }
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, args);
    default:
      // No default subcommand — show help
      output.print(help(byocCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
