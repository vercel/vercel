import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { SecurityTelemetryClient } from '../../util/telemetry/commands/security';
import output from '../../output-manager';
import check from './check';
import { securityCommand, checkSubcommand } from './command';

const COMMAND_CONFIG = {
  check: ['check'],
};

export default async function security(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(securityCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new SecurityTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('security', subcommandOriginal);
    output.print(
      help(checkSubcommand, {
        parent: securityCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  telemetry.trackCliSubcommandCheck(subcommandOriginal);
  return check(client, args);
}
