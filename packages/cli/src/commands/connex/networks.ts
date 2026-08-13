import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { ConnexNetworksTelemetryClient } from '../../util/telemetry/commands/connex/networks';
import { type Command, help } from '../help';
import {
  connexCommand,
  networksSubcommand,
  networksListSubcommand,
  networksInspectSubcommand,
} from './command';
import { networksList } from './networks-list';
import { networksInspect } from './networks-inspect';

const COMMAND_CONFIG = {
  list: getCommandAliases(networksListSubcommand),
  inspect: getCommandAliases(networksInspectSubcommand),
};

export async function networks(client: Client): Promise<number> {
  const telemetry = new ConnexNetworksTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(networksSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('connex networks', subcommand);
    output.print(
      help(networksSubcommand, {
        parent: connexCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: networksSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  try {
    switch (subcommand) {
      case 'list': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex networks', subcommandOriginal);
          printHelp(networksListSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandList(subcommandOriginal);

        const listFlagsSpec = getFlagsSpecification(
          networksListSubcommand.options
        );
        const listParsedArgs = parseArguments(args, listFlagsSpec);
        telemetry.trackCliOptionSearch(listParsedArgs.flags['--search']);
        telemetry.trackCliOptionFormat(listParsedArgs.flags['--format']);
        return await networksList(client, listParsedArgs.flags);
      }
      case 'inspect': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex networks', subcommandOriginal);
          printHelp(networksInspectSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandInspect(subcommandOriginal);

        const inspectFlagsSpec = getFlagsSpecification(
          networksInspectSubcommand.options
        );
        const inspectParsedArgs = parseArguments(args, inspectFlagsSpec);
        telemetry.trackCliArgumentId(inspectParsedArgs.args[0]);
        telemetry.trackCliOptionFormat(inspectParsedArgs.flags['--format']);
        return await networksInspect(
          client,
          inspectParsedArgs.args,
          inspectParsedArgs.flags
        );
      }
      default: {
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        output.print(
          help(networksSubcommand, {
            parent: connexCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
    }
  } catch (err) {
    printError(err);
    return 1;
  }
}
