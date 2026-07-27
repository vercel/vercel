import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { leaderboardModelsSubcommand } from './command';
import { runTimeseriesLeaderboard } from './leaderboard-shared';
import { AiGatewayLeaderboardModelsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-models';

export default async function models(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLeaderboardModelsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    leaderboardModelsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  return runTimeseriesLeaderboard(client, parsedArgs.flags, telemetry, {
    dataset: 'models',
    entityLabel: 'model',
    label: 'Top models',
  });
}
