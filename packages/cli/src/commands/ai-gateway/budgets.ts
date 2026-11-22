import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import set from './budgets-set';
import list from './budgets-list';
import inspect from './budgets-inspect';
import remove from './budgets-remove';
import budgetsDefaults from './budgets-defaults';
import {
  budgetsSubcommand,
  budgetsSetSubcommand,
  budgetsListSubcommand,
  budgetsInspectSubcommand,
  budgetsRemoveSubcommand,
  budgetsDefaultsSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { getCommandAliases } from '..';
import { AiGatewayBudgetsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets';
import { printError } from '../../util/error';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  set: getCommandAliases(budgetsSetSubcommand),
  list: getCommandAliases(budgetsListSubcommand),
  inspect: getCommandAliases(budgetsInspectSubcommand),
  remove: getCommandAliases(budgetsRemoveSubcommand),
  defaults: getCommandAliases(budgetsDefaultsSubcommand),
};

export default async function budgets(client: Client) {
  const telemetry = new AiGatewayBudgetsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(budgetsSubcommand.options);
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
    telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
    output.print(
      help(budgetsSubcommand, {
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
        parent: budgetsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsSetSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsInspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      if (subcommandOriginal === 'delete') {
        warnDeprecatedSubcommand(
          client,
          'ai-gateway budgets delete',
          'ai-gateway budgets remove'
        );
      }
      return remove(client, args);
    case 'defaults':
      // Delegate to the nested router so it can resolve `--help` for its own
      // subcommands (inspect/set/remove) instead of the group help here.
      telemetry.trackCliSubcommandDefaults(subcommandOriginal);
      if (!needHelp) {
        output.warn(
          `The ${getCommandName('ai-gateway budgets defaults')} command group is deprecated. ` +
            'Use `--default` with `budgets set`, `budgets inspect`, or `budgets remove` ' +
            `(e.g. ${getCommandName('ai-gateway budgets set user --default --amount 50')}), or ` +
            `${getCommandName('ai-gateway budgets ls --defaults')}.`
        );
      }
      return budgetsDefaults(client);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(budgetsSubcommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
