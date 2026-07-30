import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { leaderboardModelsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLeaderboardModelsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof leaderboardModelsSubcommand>
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

  trackCliOptionOut(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'out', value: this.redactedValue });
    }
  }
}
