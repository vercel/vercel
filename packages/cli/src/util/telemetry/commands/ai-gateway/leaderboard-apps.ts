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

  trackCliOptionOut(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'out', value: this.redactedValue });
    }
  }
}
