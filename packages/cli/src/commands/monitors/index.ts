import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getCommonArgs from '../../util/arg-common';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import {
  findCommandIndex,
  normalizeHelpAlias,
} from '../../util/raw-command-args';
import { MonitorsTelemetryClient } from '../../util/telemetry/commands/monitors';
import { monitorsCommand } from './command';
import { printMonitorsHelp } from './help';
import { MONITORS_CONFIG, runMonitors } from './run';

export { MONITORS_CONFIG, printMonitorsHelp, runMonitors };

export default async function monitors(client: Client): Promise<number> {
  const telemetry = new MonitorsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(monitorsCommand.options);
  const rawArgs = normalizeHelpAlias(client.argv.slice(2));

  let parsedArgs;
  try {
    parsedArgs = parseArguments(rawArgs, flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const commandIndex = findCommandIndex(rawArgs, parsedArgs.args[0], {
    ...getCommonArgs(),
    ...flagsSpecification,
  });
  const rawSubcommandArgs =
    commandIndex === -1 ? [] : rawArgs.slice(commandIndex + 1);

  const { subcommand, subcommandOriginal } = getSubcommand(
    rawSubcommandArgs[0]?.startsWith('-') ? [] : rawSubcommandArgs,
    MONITORS_CONFIG
  );
  const subcommandName = typeof subcommand === 'string' ? subcommand : 'ls';

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('monitors', subcommandOriginal);
    printMonitorsHelp(client, rawSubcommandArgs[0]);
    return 0;
  }

  trackMonitorsSubcommand(telemetry, subcommandName, subcommandOriginal);
  return runMonitors(client, rawSubcommandArgs);
}

export function trackMonitorsSubcommand(
  telemetry: MonitorsTelemetryClient,
  subcommand: string,
  original: string
) {
  const actual = original === 'default' ? 'ls' : original;
  switch (subcommand) {
    case 'schema':
      return telemetry.trackCliSubcommandSchema(actual);
    case 'add':
      return telemetry.trackCliSubcommandAdd(actual);
    case 'inspect':
      return telemetry.trackCliSubcommandInspect(actual);
    case 'rm':
      return telemetry.trackCliSubcommandRm(actual);
    case 'update':
      return telemetry.trackCliSubcommandUpdate(actual);
    default:
      return telemetry.trackCliSubcommandLs(actual);
  }
}
