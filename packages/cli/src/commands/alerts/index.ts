import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';
import { alertsCommand, listSubcommand } from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
};

export default async function alerts(client: Client): Promise<number> {
  const telemetry = new AlertsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (needHelp) {
    telemetry.trackCliFlagHelp('alerts', subcommandOriginal);
    output.print(help(alertsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  telemetry.trackCliSubcommandLs(subcommandOriginal);
  const listFn = (await import('./list')).default;
  return listFn(client, telemetry);
}
