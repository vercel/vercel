import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { leaderboardProvidersSubcommand } from './command';
import { runRankedLeaderboard } from './leaderboard-shared';
import { AiGatewayLeaderboardProvidersTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-providers';

export default async function providers(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLeaderboardProvidersTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    leaderboardProvidersSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  return runRankedLeaderboard(client, parsedArgs.flags, telemetry, {
    dataset: 'providers',
    label: 'Top providers',
  });
}
