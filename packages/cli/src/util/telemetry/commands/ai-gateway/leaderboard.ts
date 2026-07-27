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

  trackCliSubcommandLabs(actual: string) {
    this.trackCliSubcommand({ subcommand: 'labs', value: actual });
  }

  trackCliSubcommandApps(actual: string) {
    this.trackCliSubcommand({ subcommand: 'apps', value: actual });
  }

  trackCliSubcommandProviders(actual: string) {
    this.trackCliSubcommand({ subcommand: 'providers', value: actual });
  }
}
