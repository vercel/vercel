import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { leaderboardSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLeaderboardTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof leaderboardSubcommand>
{
  trackCliSubcommandModels(actual: string) {
    this.trackCliSubcommand({ subcommand: 'models', value: actual });
  }
}
