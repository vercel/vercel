import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import ls from './ls';
import get from './get';
import create from './create';
import rm from './rm';
import {
  webhooksCommand,
  listSubcommand,
  getSubcommand as getSubcommandDef,
  createSubcommand,
  removeSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { WebhooksTelemetryClient } from '../../util/telemetry/commands/webhooks';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  create: ['create', 'add'],
  get: ['get', 'inspect'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove', 'delete'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(webhooksCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new WebhooksTelemetryClient({
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
    telemetry.trackCliFlagHelp('webhooks');
    output.print(help(webhooksCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: webhooksCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('webhooks', subcommandOriginal);
        return printHelp(createSubcommand);
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'get':
      if (needHelp) {
        telemetry.trackCliFlagHelp('webhooks', subcommandOriginal);
        return printHelp(getSubcommandDef);
      }
      telemetry.trackCliSubcommandGet(subcommandOriginal);
      return get(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('webhooks', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('webhooks', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
