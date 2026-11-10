import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import apiKeys from './api-keys';
import budgets from './budgets';
import rules from './rules';
import virtualModels from './virtual-models';
import codingAgents from './coding-agents';
import setup from './coding-agents-setup';
import models from './models';
import leaderboard from './leaderboard';
import {
  aiGatewayCommand,
  apiKeysSubcommand,
  budgetsSubcommand,
  rulesSubcommand,
  virtualModelsSubcommand,
  codingAgentsSubcommand,
  setupSubcommand,
  modelsSubcommand,
  leaderboardSubcommand,
} from './command';
import { help } from '../help';
import { getCommandAliases } from '..';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { AiGatewayTelemetryClient } from '../../util/telemetry/commands/ai-gateway';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  'api-keys': getCommandAliases(apiKeysSubcommand),
  budgets: getCommandAliases(budgetsSubcommand),
  rules: getCommandAliases(rulesSubcommand),
  'virtual-models': getCommandAliases(virtualModelsSubcommand),
  'coding-agents': getCommandAliases(codingAgentsSubcommand),
  setup: getCommandAliases(setupSubcommand),
  models: getCommandAliases(modelsSubcommand),
  leaderboard: getCommandAliases(leaderboardSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(aiGatewayCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 2;
  }

  const telemetry = new AiGatewayTelemetryClient({
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
    telemetry.trackCliFlagHelp('ai-gateway');
    output.print(
      help(aiGatewayCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'api-keys':
      telemetry.trackCliSubcommandApiKeys(subcommandOriginal);
      return apiKeys(client);
    case 'budgets':
      telemetry.trackCliSubcommandBudgets(subcommandOriginal);
      return budgets(client);
    case 'rules':
      telemetry.trackCliSubcommandRules(subcommandOriginal);
      return rules(client);
    case 'virtual-models':
      telemetry.trackCliSubcommandVirtualModels(subcommandOriginal);
      return virtualModels(client);
    case 'coding-agents':
      telemetry.trackCliSubcommandCodingAgents(subcommandOriginal);
      return codingAgents(client);
    case 'setup':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway', subcommandOriginal);
        output.print(
          help(setupSubcommand, {
            stream: client.stderr,
            parent: aiGatewayCommand,
            columns: client.stderr.columns,
          })
        );
        return 0;
      }
      telemetry.trackCliSubcommandSetup(subcommandOriginal);
      return setup(client, args);
    case 'models':
      telemetry.trackCliSubcommandModels(subcommandOriginal);
      return models(client);
    case 'leaderboard':
      telemetry.trackCliSubcommandLeaderboard(subcommandOriginal);
      return leaderboard(client);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway', subcommandOriginal);
        output.print(
          help(aiGatewayCommand, {
            stream: client.stderr,
            columns: client.stderr.columns,
          })
        );
        return 0;
      }
      output.error(
        'Please specify a subcommand. Run `vercel ai-gateway --help` for usage information.'
      );
      return 2;
  }
}
