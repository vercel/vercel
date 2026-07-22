import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import set from './budgets-set';
import list from './budgets-list';
import remove from './budgets-remove';
import {
  budgetsSubcommand,
  budgetsSetSubcommand,
  budgetsListSubcommand,
  budgetsRemoveSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayBudgetsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  set: getCommandAliases(budgetsSetSubcommand),
  list: getCommandAliases(budgetsListSubcommand),
  remove: getCommandAliases(budgetsRemoveSubcommand),
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
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
    output.print(help(budgetsSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
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
        return 2;
      }
      telemetry.trackCliSubcommandSet(subcommandOriginal);
      return set(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway budgets', subcommandOriginal);
        printHelp(budgetsRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(budgetsSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
