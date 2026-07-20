import type Client from '../../util/client';
import { leaderboardModelsSubcommand } from './command';
import { runLeaderboardSubcommand } from './leaderboard-shared';
import { AiGatewayLeaderboardModelsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-models';

export default async function models(client: Client, argv: string[]) {
  return runLeaderboardSubcommand(client, argv, leaderboardModelsSubcommand, {
    kind: 'timeseries',
    telemetry: new AiGatewayLeaderboardModelsTelemetryClient({
      opts: { store: client.telemetryEventStore },
    }),
    dataset: 'models',
    entityLabel: 'model',
    label: 'Top models',
  });
}
