import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { getCommandAliases } from '..';
import { TracesTelemetryClient } from '../../util/telemetry/commands/traces';
import {
  getSubcommand as getSubcommandMetadata,
  tracesCommand,
} from './command';

const COMMAND_CONFIG = {
  get: getCommandAliases(getSubcommandMetadata),
};

export default async function traces(client: Client): Promise<number> {
  const telemetry = new TracesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(tracesCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('traces', subcommandOriginal);
    const helpTarget =
      subcommand === 'get' ? getSubcommandMetadata : tracesCommand;
    output.print(
      help(helpTarget, {
        parent: subcommand === 'get' ? tracesCommand : undefined,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  // `get` is the only — and default — subcommand. Delegate to the handler so
  // it can parse the positional `requestId` itself.
  const getFn = (await import('./get')).default;
  return getFn(client, telemetry);
}
