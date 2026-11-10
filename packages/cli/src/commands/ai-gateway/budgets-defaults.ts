import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './budgets-defaults-list';
import set from './budgets-defaults-set';
import remove from './budgets-defaults-remove';
import {
  budgetsDefaultsSubcommand,
  budgetsDefaultsListSubcommand,
  budgetsDefaultsSetSubcommand,
  budgetsDefaultsRemoveSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayBudgetsDefaultsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-defaults';
import { printError } from '../../util/error';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  list: getCommandAliases(budgetsDefaultsListSubcommand),
  set: getCommandAliases(budgetsDefaultsSetSubcommand),
  remove: getCommandAliases(budgetsDefaultsRemoveSubcommand),
};

export default async function budgetsDefaults(client: Client) {
  const telemetry = new AiGatewayBudgetsDefaultsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    budgetsDefaultsSubcommand.options
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

  const subArgs = parsedArgs.args.slice(3);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp(
      'ai-gateway budgets defaults',
      subcommandOriginal
    );
    output.print(
      help(budgetsDefaultsSubcommand, {
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
        parent: budgetsDefaultsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway budgets defaults',
          subcommandOriginal
        );
        printHelp(budgetsDefaultsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway budgets defaults',
          subcommandOriginal
        );
        printHelp(budgetsDefaultsSetSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway budgets defaults',
          subcommandOriginal
        );
        printHelp(budgetsDefaultsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      if (subcommandOriginal === 'delete') {
        warnDeprecatedSubcommand(
          client,
          'ai-gateway budgets defaults delete',
          'ai-gateway budgets defaults remove'
        );
      }
      return remove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(budgetsDefaultsSubcommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
