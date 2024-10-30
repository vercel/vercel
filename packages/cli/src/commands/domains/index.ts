import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import add from './add';
import buy from './buy';
import transferIn from './transfer-in';
import inspect from './inspect';
import ls from './ls';
import rm from './rm';
import move from './move';
import { domainsCommand } from './command';
import { help } from '../help';
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
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(domainsCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { telemetryEventStore } = client;
  const telemetry = new DomainsTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('domains', subcommand);
    output.print(help(domainsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'add':
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, parsedArgs.flags, args);
    case 'inspect':
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, parsedArgs.flags, args);
    case 'move':
      telemetry.trackCliSubcommandMove(subcommandOriginal);
      return move(client, parsedArgs.flags, args);
    case 'buy':
      telemetry.trackCliSubcommandBuy(subcommandOriginal);
      return buy(client, parsedArgs.flags, args);
    case 'rm':
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, parsedArgs.flags, args);
    case 'transferIn':
      telemetry.trackCliSubcommandTransferIn(subcommandOriginal);
      return transferIn(client, parsedArgs.flags, args);
    default:
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, parsedArgs.flags, args);
  }
}
