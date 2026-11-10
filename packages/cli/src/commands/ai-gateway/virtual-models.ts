import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import create from './virtual-models-create';
import list from './virtual-models-list';
import inspect from './virtual-models-inspect';
import edit from './virtual-models-edit';
import remove from './virtual-models-remove';
import restore from './virtual-models-restore';
import {
  virtualModelsSubcommand,
  virtualModelsCreateSubcommand,
  virtualModelsListSubcommand,
  virtualModelsInspectSubcommand,
  virtualModelsEditSubcommand,
  virtualModelsRemoveSubcommand,
  virtualModelsRestoreSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { AiGatewayVirtualModelsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  create: getCommandAliases(virtualModelsCreateSubcommand),
  list: getCommandAliases(virtualModelsListSubcommand),
  inspect: getCommandAliases(virtualModelsInspectSubcommand),
  update: getCommandAliases(virtualModelsEditSubcommand),
  delete: getCommandAliases(virtualModelsRemoveSubcommand),
  restore: getCommandAliases(virtualModelsRestoreSubcommand),
};

export default async function virtualModels(client: Client) {
  const telemetry = new AiGatewayVirtualModelsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    virtualModelsSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway virtual-models', subcommandOriginal);
    output.print(
      help(virtualModelsSubcommand, {
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
        parent: virtualModelsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsCreateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsInspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsEditSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      if (subcommandOriginal === 'edit') {
        warnDeprecatedSubcommand(
          client,
          'ai-gateway virtual-models edit',
          'ai-gateway virtual-models update'
        );
      }
      return edit(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          'ai-gateway virtual-models remove',
          'ai-gateway virtual-models delete'
        );
      }
      return remove(client, args);
    case 'restore':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway virtual-models',
          subcommandOriginal
        );
        printHelp(virtualModelsRestoreSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRestore(subcommandOriginal);
      return restore(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(virtualModelsSubcommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
