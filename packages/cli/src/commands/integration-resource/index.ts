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
  inspectSubcommand,
  integrationResourceCommand,
  removeSubcommand,
} from './command';
import { claim } from './claim';
import { connect } from './connect';
import { createThreshold } from './create-threshold';
import { disconnect } from './disconnect';
import { inspect } from './inspect';
import { remove } from './remove-resource';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  delete: getCommandAliases(removeSubcommand),
  disconnect: getCommandAliases(disconnectSubcommand),
  connect: getCommandAliases(connectSubcommand),
  'create-threshold': getCommandAliases(createThresholdSubcommand),
  claim: getCommandAliases(claimSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
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
      help(integrationResourceCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
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
    case 'delete': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          `${options.helpBreadcrumb} remove`,
          'integration resource delete'
        );
      }
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
    case 'inspect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp(options.helpBreadcrumb, subcommandOriginal);
        printHelp(inspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      if (subcommandOriginal === 'status') {
        warnDeprecatedSubcommand(
          client,
          `${options.helpBreadcrumb} status`,
          'integration resource inspect'
        );
      }
      return inspect(client, innerArgs);
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
  if (args[0] === 'integration-resource' || args[0] === 'ir') {
    warnDeprecatedSubcommand(client, args[0], 'integration resource');
  }
  return dispatchResourceSubcommand(client, args.slice(1), !!flags['--help'], {
    helpBreadcrumb: 'integration-resource',
    parentForChildHelp: integrationResourceCommand,
  });
}
