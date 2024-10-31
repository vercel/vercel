import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';

import add from './add';
import importZone from './import';
import ls from './ls';
import rm from './rm';
import { dnsCommand } from './command';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { DnsTelemetryClient } from '../../util/telemetry/commands/dns';

const COMMAND_CONFIG = {
  add: ['add'],
  import: ['import'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function dns(client: Client) {
  const { telemetryEventStore } = client;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(dnsCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
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

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('dns', subcommand);
    output.print(help(dnsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'add':
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, parsedArgs.flags, args);
    case 'import':
      telemetry.trackCliSubcommandImport(subcommandOriginal);
      return importZone(client, parsedArgs.flags, args);
    case 'rm':
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, parsedArgs.flags, args);
    default:
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, parsedArgs.flags, args);
  }
}
