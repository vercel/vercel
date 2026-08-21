import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { printError } from '../../../util/error';
import { help } from '../../help';
import list from './list';
import inspect from './inspect';
import {
  firewallCommand,
  alertsSubcommand,
  alertsInspectSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { takeNestedInspect } from '../shared';
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

export default async function alerts(
  client: Client,
  args: string[],
  telemetry: FirewallTelemetryClient
) {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(args, getFlagsSpecification([]), {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const needHelp = parsedArgs.flags['--help'];
  const { isInspect, rest } = takeNestedInspect(args);

  if (isInspect) {
    if (needHelp) {
      telemetry.trackCliFlagHelp('firewall', 'alerts:inspect');
      output.print(
        help(alertsInspectSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
    }
    telemetry.trackCliSubcommandAlertsInspect('inspect');
    return inspect(client, rest);
  }

  if (needHelp) {
    telemetry.trackCliFlagHelp('firewall', 'alerts');
    output.print(
      help(alertsSubcommand, {
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  return list(client, rest);
}
