import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { IntegrationTelemetryClient } from '../../util/telemetry/commands/integration';
import { type Command, help } from '../help';
import { add } from './add';
import { balance } from './balance';
import {
  addSubcommand,
  balanceSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  removeSubcommand,
} from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove-integration';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  open: getCommandAliases(openSubcommand),
  list: getCommandAliases(listSubcommand),
  balance: getCommandAliases(balanceSubcommand),
  remove: getCommandAliases(removeSubcommand),
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

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: integrationCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('integration');
    output.print(
      help(integrationCommand, {
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, subArgs);
    }
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'balance': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(balanceSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandBalance(subcommandOriginal);
      return balance(client, subArgs);
    }
    case 'open': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(openSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
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
