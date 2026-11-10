import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { leaderboardLabsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLeaderboardLabsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof leaderboardLabsSubcommand>
{
  trackCliOptionModality(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'modality', value });
    }
  }

  trackCliOptionMetric(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'metric', value });
    }
  }

  trackCliOptionDate(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'date', value });
    }
  }

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
