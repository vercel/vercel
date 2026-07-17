import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { leaderboardLabsSubcommand } from './command';
import { runTimeseriesLeaderboard } from './leaderboard-shared';
import { AiGatewayLeaderboardLabsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-labs';

export default async function labs(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLeaderboardLabsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    leaderboardLabsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  return runTimeseriesLeaderboard(client, parsedArgs.flags, telemetry, {
    dataset: 'labs',
    entityLabel: 'lab',
    label: 'Top labs',
  });
}
