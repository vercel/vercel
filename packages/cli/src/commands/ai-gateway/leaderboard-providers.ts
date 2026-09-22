import type Client from '../../util/client';
import { leaderboardProvidersSubcommand } from './command';
import { runLeaderboardSubcommand } from './leaderboard-shared';
import { AiGatewayLeaderboardProvidersTelemetryClient } from '../../util/telemetry/commands/ai-gateway/leaderboard-providers';

export default async function providers(client: Client, argv: string[]) {
  return runLeaderboardSubcommand(
    client,
    argv,
    leaderboardProvidersSubcommand,
    {
      kind: 'ranked',
      telemetry: new AiGatewayLeaderboardProvidersTelemetryClient({
        opts: { store: client.telemetryEventStore },
      }),
      dataset: 'providers',
      label: 'Top providers',
    }
  );
}
