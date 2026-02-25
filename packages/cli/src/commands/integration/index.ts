import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
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
  discoverSubcommand,
  guideSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  removeSubcommand,
} from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove-integration';
import { discover } from './discover';
import { guide } from './guide';
import { printAddDynamicHelp } from './add-help';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  open: getCommandAliases(openSubcommand),
  list: getCommandAliases(listSubcommand),
  discover: getCommandAliases(discoverSubcommand),
  guide: getCommandAliases(guideSubcommand),
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
    return 0;
  }

  switch (subcommand) {
    case 'add': {
      const ffAutoProvision = process.env.FF_AUTO_PROVISION_INSTALL === '1';
      const addCmd = ffAutoProvision
        ? addSubcommand
        : {
            ...addSubcommand,
            options: addSubcommand.options.filter(
              o => o.name !== 'installation-id' && o.name !== 'format'
            ),
          };

      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);

        const printed = await printAddDynamicHelp(
          client,
          subArgs[0],
          addCmd,
          cmd => printHelp(cmd),
          'integration add'
        );

        if (!printed) {
          printHelp(addCmd);
        }

        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);

      // Parse add-specific flags from subArgs (which contains everything after 'add')
      const addFlagsSpec = getFlagsSpecification(addSubcommand.options);
      let addParsedArgs;
      try {
        addParsedArgs = parseArguments(subArgs, addFlagsSpec);
      } catch (error) {
        printError(error);
        return 1;
      }

      if (!ffAutoProvision && addParsedArgs.flags['--installation-id']) {
        output.error('Unknown or unexpected option: --installation-id');
        return 1;
      }

      return add(
        client,
        addParsedArgs.args,
        addParsedArgs.flags,
        'integration add'
      );
    }
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'discover': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(discoverSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDiscover(subcommandOriginal);
      return discover(client, subArgs);
    }
    case 'guide': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(guideSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandGuide(subcommandOriginal);
      return guide(client, subArgs);
    }
    case 'balance': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(balanceSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandBalance(subcommandOriginal);
      return balance(client);
    }
    case 'open': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(openSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
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
