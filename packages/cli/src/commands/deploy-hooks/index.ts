import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import ls from './ls';
import create from './create';
import rm from './rm';
import {
  deployHooksCommand,
  listSubcommand,
  createSubcommand,
  removeSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { DeployHooksTelemetryClient } from '../../util/telemetry/commands/deploy-hooks';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  create: ['create', 'add'],
  ls: ['ls', 'list'],
  delete: ['delete', 'rm', 'del', 'remove'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(deployHooksCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  const telemetry = new DeployHooksTelemetryClient({
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
    telemetry.trackCliFlagHelp('deploy-hooks');
    output.print(
      help(deployHooksCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: deployHooksCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('deploy-hooks', subcommandOriginal);
        return printHelp(createSubcommand);
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(
          client,
          'deploy-hooks add',
          'deploy-hooks create'
        );
      }
      return create(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('deploy-hooks', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          'deploy-hooks remove',
          'deploy-hooks delete'
        );
      }
      return rm(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('deploy-hooks', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
