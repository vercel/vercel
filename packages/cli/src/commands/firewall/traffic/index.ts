import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { printError } from '../../../util/error';
import { help } from '../../help';
import dashboard from './dashboard';
import inspect from './inspect';
import {
  firewallCommand,
  trafficSubcommand,
  trafficInspectSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { takeNestedInspect } from '../shared';
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

export default async function traffic(
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
      telemetry.trackCliFlagHelp('firewall', 'traffic:inspect');
      output.print(
        help(trafficInspectSubcommand, {
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
    }
    telemetry.trackCliSubcommandTrafficInspect('inspect');
    return inspect(client, rest);
  }

  if (needHelp) {
    telemetry.trackCliFlagHelp('firewall', 'traffic');
    output.print(
      help(trafficSubcommand, {
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  return dashboard(client, rest);
}
