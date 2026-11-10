import type Client from '../../util/client';
import { leaderboardLabsSubcommand } from './command';
import { runLeaderboardSubcommand } from './leaderboard-shared';
import { AiGatewayLeaderboardLabsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-labs';

export default async function labs(client: Client, argv: string[]) {
  return runLeaderboardSubcommand(client, argv, leaderboardLabsSubcommand, {
    kind: 'timeseries',
    telemetry: new AiGatewayLeaderboardLabsTelemetryClient({
      opts: { store: client.telemetryEventStore },
    }),
    dataset: 'labs',
    entityLabel: 'lab',
    label: 'Top labs',
  });
}
