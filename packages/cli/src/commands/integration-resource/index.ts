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
  createThresholdSubcommand,
  disconnectSubcommand,
  integrationResourceCommand,
  removeSubcommand,
} from './command';
import { createThreshold } from './create-threshold';
import { disconnect } from './disconnect';
import { remove } from './remove-resource';

const COMMAND_CONFIG = {
  remove: getCommandAliases(removeSubcommand),
  disconnect: getCommandAliases(disconnectSubcommand),
  'create-threshold': getCommandAliases(createThresholdSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new IntegrationResourceTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationResourceCommand.options),
    { permissive: true }
  );
  const { subcommand, subcommandOriginal } = getSubcommand(
    args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = flags['--help'];

  if (!subcommand && needHelp) {
    output.print(
      help(integrationResourceCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: integrationResourceCommand,
      })
    );
  }

  switch (subcommand) {
    case 'create-threshold': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration-resource', subcommandOriginal);
        printHelp(createThresholdSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreateThreshold(subcommandOriginal);
      return createThreshold(client);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration-resource', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client);
    }
    case 'disconnect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration-resource', subcommandOriginal);
        printHelp(disconnectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDisconnect(subcommandOriginal);
      return disconnect(client);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
