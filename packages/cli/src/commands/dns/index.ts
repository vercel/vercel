import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import add from './add';
import importZone from './import';
import ls from './ls';
import rm from './rm';
import {
  addSubcommand,
  dnsCommand,
  importSubcommand,
  listSubcommand,
  removeSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { DnsTelemetryClient } from '../../util/telemetry/commands/dns';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  import: getCommandAliases(importSubcommand),
  ls: getCommandAliases(listSubcommand),
  rm: getCommandAliases(removeSubcommand),
};

export default async function dns(client: Client) {
  const { telemetryEventStore } = client;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(dnsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new DnsTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('dns', subcommand);
    output.print(help(dnsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: dnsCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('dns', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'import':
      if (needHelp) {
        telemetry.trackCliFlagHelp('dns', subcommandOriginal);
        printHelp(importSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandImport(subcommandOriginal);
      return importZone(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('dns', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('dns', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
