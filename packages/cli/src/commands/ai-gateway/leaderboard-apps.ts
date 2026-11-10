import type Client from '../../util/client';
import { leaderboardAppsSubcommand } from './command';
import { runLeaderboardSubcommand } from './leaderboard-shared';
import { AiGatewayLeaderboardAppsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-apps';

export default async function apps(client: Client, argv: string[]) {
  return runLeaderboardSubcommand(client, argv, leaderboardAppsSubcommand, {
    kind: 'ranked',
    telemetry: new AiGatewayLeaderboardAppsTelemetryClient({
      opts: { store: client.telemetryEventStore },
    }),
    dataset: 'apps',
    label: 'Top apps',
  });
}
