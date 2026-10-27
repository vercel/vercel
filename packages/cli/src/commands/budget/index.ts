import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { help } from '../help';
import type { Command } from '../help';
import { getCommandAliases } from '..';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { BudgetTelemetryClient } from '../../util/telemetry/commands/budget';
import output from '../../output-manager';
import {
  budgetCommand,
  listSubcommand,
  setSubcommand,
  removeSubcommand,
  inspectSubcommand,
  alertsSubcommand,
} from './command';
import list from './list';
import set from './set';
import remove from './remove';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import inspect from './inspect';
import alerts from './alerts';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  list: getCommandAliases(listSubcommand),
  set: getCommandAliases(setSubcommand),
  remove: getCommandAliases(removeSubcommand),
  alerts: getCommandAliases(alertsSubcommand),
};

const ADVERTISED_COMMAND_CONFIG = COMMAND_CONFIG;

export default async function budget(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(budgetCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  const telemetry = new BudgetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('budgets');
    output.print(
      help(budgetCommand, {
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
        parent: budgetCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      if (subcommandOriginal === 'overview') {
        warnDeprecatedSubcommand(client, 'budgets overview', 'budgets inspect');
      }
      return inspect(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'set':
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets', subcommandOriginal);
        printHelp(setSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      if (subcommandOriginal === 'update') {
        warnDeprecatedSubcommand(client, 'budgets update', 'budgets set');
      }
      return set(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      if (subcommandOriginal === 'delete' || subcommandOriginal === 'disable') {
        warnDeprecatedSubcommand(
          client,
          `budgets ${subcommandOriginal}`,
          'budgets remove'
        );
      }
      return remove(client, args);
    case 'alerts':
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets', subcommandOriginal);
        printHelp(alertsSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAlerts(subcommandOriginal);
      return alerts(client, args);
    default: {
      const unknown = args[0];
      if (unknown && !unknown.startsWith('-')) {
        output.error(getInvalidSubcommand(ADVERTISED_COMMAND_CONFIG));
        output.print(
          help(budgetCommand, {
            stream: client.stderr,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      if (needHelp) {
        telemetry.trackCliFlagHelp('budgets');
        output.print(
          help(budgetCommand, {
            stream: client.stderr,
            columns: client.stderr.columns,
          })
        );
        return 0;
      }
      return list(client, args);
    }
  }
}
