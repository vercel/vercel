import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import models from './leaderboard-models';
import labs from './leaderboard-labs';
import apps from './leaderboard-apps';
import providers from './leaderboard-providers';
import {
  leaderboardSubcommand,
  leaderboardModelsSubcommand,
  leaderboardLabsSubcommand,
  leaderboardAppsSubcommand,
  leaderboardProvidersSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayLeaderboardTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  models: getCommandAliases(leaderboardModelsSubcommand),
  labs: getCommandAliases(leaderboardLabsSubcommand),
  apps: getCommandAliases(leaderboardAppsSubcommand),
  providers: getCommandAliases(leaderboardProvidersSubcommand),
};

export default async function leaderboard(client: Client) {
  const telemetry = new AiGatewayLeaderboardTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    leaderboardSubcommand.options
  );
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
    telemetry.trackCliFlagHelp('ai-gateway leaderboard', subcommandOriginal);
    output.print(
      help(leaderboardSubcommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: leaderboardSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'models':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway leaderboard',
          subcommandOriginal
        );
        printHelp(leaderboardModelsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandModels(subcommandOriginal);
      return models(client, args);
    case 'labs':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway leaderboard',
          subcommandOriginal
        );
        printHelp(leaderboardLabsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandLabs(subcommandOriginal);
      return labs(client, args);
    case 'apps':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway leaderboard',
          subcommandOriginal
        );
        printHelp(leaderboardAppsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandApps(subcommandOriginal);
      return apps(client, args);
    case 'providers':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway leaderboard',
          subcommandOriginal
        );
        printHelp(leaderboardProvidersSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandProviders(subcommandOriginal);
      return providers(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(leaderboardSubcommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
