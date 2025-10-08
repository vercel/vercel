import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import pull from './pull';
import { microfrontendsCommand, pullSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getSubcommand from '../../util/get-subcommand';
import { MicrofrontendsTelemetryClient } from '../../util/telemetry/commands/microfrontends';

const COMMAND_CONFIG = {
  pull: getCommandAliases(pullSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new MicrofrontendsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    microfrontendsCommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  // eslint-disable-next-line prefer-const
  let { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('microfrontends');
    output.print(
      help(microfrontendsCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: microfrontendsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'pull':
      if (needHelp) {
        telemetry.trackCliFlagHelp('microfrontends', subcommandOriginal);
        return printHelp(pullSubcommand);
      }
      telemetry.trackCliSubcommandPull(subcommandOriginal);
      return pull(client);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(microfrontendsCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
