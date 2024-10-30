import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { IntegrationTelemetryClient } from '../../util/telemetry/commands/integration';
import { type Command, help } from '../help';
import { add } from './add';
import {
  addSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  removeSubcommand,
} from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove-integration';

const COMMAND_CONFIG = {
  add: ['add'],
  open: ['open'],
  list: ['list', 'ls'],
  remove: ['remove'],
};

export default async function main(client: Client) {
  const telemetry = new IntegrationTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationCommand.options),
    { permissive: true }
  );
  const {
    subcommand,
    subcommandOriginal,
    args: subArgs,
  } = getSubcommand(args.slice(1), COMMAND_CONFIG);

  const needHelp = flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('integration');
    output.print(help(integrationCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(help(command, { columns: client.stderr.columns }));
  }

  switch (subcommand) {
    case 'add': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', 'add');
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, subArgs);
    }
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', 'list');
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'open': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', 'open');
        printHelp(openSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', 'remove');
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
