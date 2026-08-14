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

  trackCliOptionOut(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'out', value: this.redactedValue });
    }
  }
}
