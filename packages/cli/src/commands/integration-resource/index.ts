import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { IntegrationResourceTelemetryClient } from '../../util/telemetry/commands/integration-resource';
import { type Command, help } from '../help';
import {
  claimSubcommand,
  connectSubcommand,
  createThresholdSubcommand,
  disconnectSubcommand,
  integrationResourceCommand,
  removeSubcommand,
} from './command';
import { claim } from './claim';
import { connect } from './connect';
import { createThreshold } from './create-threshold';
import { disconnect } from './disconnect';
import { remove } from './remove-resource';

const COMMAND_CONFIG = {
  remove: getCommandAliases(removeSubcommand),
  disconnect: getCommandAliases(disconnectSubcommand),
  connect: getCommandAliases(connectSubcommand),
  'create-threshold': getCommandAliases(createThresholdSubcommand),
  claim: getCommandAliases(claimSubcommand),
};

interface DispatchOptions {
  helpBreadcrumb: string;
  parentForChildHelp: Command;
}

export async function dispatchResourceSubcommand(
  client: Client,
  subArgs: string[],
  needHelp: boolean,
  options: DispatchOptions
): Promise<number> {
  const telemetry = new IntegrationResourceTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const {
    subcommand,
    subcommandOriginal,
    args: innerArgs,
  } = getSubcommand(subArgs, COMMAND_CONFIG);

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp(options.helpBreadcrumb);
    output.print(
      help(integrationResourceCommand, { columns: client.stderr.columns })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: options.parentForChildHelp,
      })
    );
  }

  switch (subcommand) {
    case 'create-threshold': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(createThresholdSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandCreateThreshold(subcommandOriginal);
      return createThreshold(client, innerArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, innerArgs);
    }
    case 'disconnect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(disconnectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDisconnect(subcommandOriginal);
      return disconnect(client, innerArgs);
    }
    case 'connect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(connectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, innerArgs);
    }
    case 'claim': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(claimSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandClaim(subcommandOriginal);
      return claim(client, innerArgs);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}

export default async function main(client: Client) {
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationResourceCommand.options),
    { permissive: true }
  );
  return dispatchResourceSubcommand(client, args.slice(1), !!flags['--help'], {
    helpBreadcrumb: 'integration-resource',
    parentForChildHelp: integrationResourceCommand,
  });
}
