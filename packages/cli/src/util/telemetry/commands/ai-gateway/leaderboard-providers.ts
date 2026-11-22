import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { leaderboardProvidersSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLeaderboardProvidersTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof leaderboardProvidersSubcommand>
{
  trackCliOptionFormat(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'format', value });
    }
  }

  trackCliOptionOutput(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'output', value: this.redactedValue });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionOut(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'out', value: this.redactedValue });
    }
  }
}
