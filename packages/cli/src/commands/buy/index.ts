import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import credits from './credits';
import addon from './addon';
import pro from './pro';
import v0 from './v0';
import domain from './domain';
import {
  buyCommand,
  creditsSubcommand,
  addonSubcommand,
  proSubcommand,
  v0Subcommand,
  domainSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getCommandAliases } from '..';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { BuyTelemetryClient } from '../../util/telemetry/commands/buy';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  credits: getCommandAliases(creditsSubcommand),
  addon: getCommandAliases(addonSubcommand),
  pro: getCommandAliases(proSubcommand),
  v0: getCommandAliases(v0Subcommand),
  domain: getCommandAliases(domainSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(buyCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new BuyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('buy');
    output.print(help(buyCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: buyCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  // If no subcommand provided, show help
  if (!subcommand) {
    output.print(help(buyCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'credits':
      if (needHelp) {
        telemetry.trackCliFlagHelp('buy', subcommandOriginal);
        return printHelp(creditsSubcommand);
      }
      telemetry.trackCliSubcommandCredits(subcommandOriginal);
      return credits(client, args);
    case 'addon':
      if (needHelp) {
        telemetry.trackCliFlagHelp('buy', subcommandOriginal);
        return printHelp(addonSubcommand);
      }
      telemetry.trackCliSubcommandAddon(subcommandOriginal);
      return addon(client, args);
    case 'pro':
      if (needHelp) {
        telemetry.trackCliFlagHelp('buy', subcommandOriginal);
        return printHelp(proSubcommand);
      }
      telemetry.trackCliSubcommandPro(subcommandOriginal);
      return pro(client, args);
    case 'v0':
      if (needHelp) {
        telemetry.trackCliFlagHelp('buy', subcommandOriginal);
        return printHelp(v0Subcommand);
      }
      telemetry.trackCliSubcommandV0(subcommandOriginal);
      return v0(client, args);
    case 'domain':
      if (needHelp) {
        telemetry.trackCliFlagHelp('buy', subcommandOriginal);
        return printHelp(domainSubcommand);
      }
      telemetry.trackCliSubcommandDomain(subcommandOriginal);
      return domain(client, args);
    default:
      output.error(`Unknown subcommand: ${subcommand}`);
      output.print(help(buyCommand, { columns: client.stderr.columns }));
      return 1;
  }
}
