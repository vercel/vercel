import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { leaderboardAppsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLeaderboardAppsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof leaderboardAppsSubcommand>
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
