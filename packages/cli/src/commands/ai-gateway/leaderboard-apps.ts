import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { leaderboardAppsSubcommand } from './command';
import { runRankedLeaderboard } from './leaderboard-shared';
import { AiGatewayLeaderboardAppsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-apps';

export default async function apps(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLeaderboardAppsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    leaderboardAppsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  return runRankedLeaderboard(client, parsedArgs.flags, telemetry, {
    dataset: 'apps',
    label: 'Top apps',
  });
}
