import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsRulesTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import rulesLs from './rules-ls';
import rulesAdd from './rules-add';
import rulesUpdate from './rules-update';
import rulesRemove from './rules-remove';
import rulesMove from './rules-move';
import {
  flagsCommand,
  rulesAddSubcommand,
  rulesListSubcommand,
  rulesMoveSubcommand,
  rulesRemoveSubcommand,
  rulesSubcommand,
  rulesUpdateSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(rulesListSubcommand),
  add: getCommandAliases(rulesAddSubcommand),
  update: getCommandAliases(rulesUpdateSubcommand),
  rm: getCommandAliases(rulesRemoveSubcommand),
  move: getCommandAliases(rulesMoveSubcommand),
};

export async function rules(client: Client): Promise<number> {
  const telemetry = new FlagsRulesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(rulesSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('flags rules', subcommand);
    output.print(
      help(rulesSubcommand, {
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: rulesSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags rules', subcommandOriginal);
        printHelp(rulesListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return rulesLs(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags rules', subcommandOriginal);
        printHelp(rulesAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return rulesAdd(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags rules', subcommandOriginal);
        printHelp(rulesUpdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return rulesUpdate(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags rules', subcommandOriginal);
        printHelp(rulesRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rulesRemove(client, args);
    case 'move':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags rules', subcommandOriginal);
        printHelp(rulesMoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandMove(subcommandOriginal);
      return rulesMove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(rulesSubcommand, {
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
