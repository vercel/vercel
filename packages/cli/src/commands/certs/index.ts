import { handleError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import add from './add';
import issue from './issue';
import ls from './ls';
import rm from './rm';
import { certsCommand } from './command';
import { help } from '../help';
import Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';

import { CertsTelemetryClient } from '../../util/telemetry/commands/certs';

const COMMAND_CONFIG = {
  add: ['add'],
  issue: ['issue'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  const { telemetryEventStore } = client;
  const telemetry = new CertsTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(certsCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('certs', subcommand);
    output.print(help(certsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'issue':
      telemetry.trackCliSubcommandIssue(subcommandOriginal);
      return issue(client, parsedArgs.flags, args);
    case 'ls':
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, parsedArgs.flags, args);
    case 'rm':
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, parsedArgs.flags, args);
    case 'add':
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, parsedArgs.flags, args);
    default:
      output.error('Please specify a valid subcommand: ls | issue | rm');
      output.print(help(certsCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
