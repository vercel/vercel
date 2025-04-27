import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import add from './add';
import buy from './buy';
import transferIn from './transfer-in';
import inspect from './inspect';
import ls from './ls';
import rm from './rm';
import move from './move';
import {
  addSubcommand,
  buySubcommand,
  domainsCommand,
  inspectSubcommand,
  moveSubcommand,
  removeSubcommand,
  transferInSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { DomainsTelemetryClient } from '../../util/telemetry/commands/domains';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  inspect: ['inspect'],
  ls: ['ls', 'list'],
  move: ['move'],
  rm: ['rm', 'remove'],
  transferIn: ['transfer-in'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(domainsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new DomainsTelemetryClient({
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
    telemetry.trackCliFlagHelp('domains');
    output.print(help(domainsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: domainsCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'move':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(moveSubcommand);
      }
      telemetry.trackCliSubcommandMove(subcommandOriginal);
      return move(client, args);
    case 'buy':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(buySubcommand);
      }
      telemetry.trackCliSubcommandBuy(subcommandOriginal);
      return buy(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    case 'transferIn':
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(transferInSubcommand);
      }
      telemetry.trackCliSubcommandTransferIn(subcommandOriginal);
      return transferIn(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('domains', subcommandOriginal);
        return printHelp(transferInSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
