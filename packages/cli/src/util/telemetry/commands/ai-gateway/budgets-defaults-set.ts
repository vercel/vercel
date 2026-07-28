import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsSetSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsSetSubcommand>
{
  trackCliOptionPerProject(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'per-project', value: this.redactedValue });
    }
  }

  trackCliOptionPerApiKey(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'per-api-key', value: this.redactedValue });
    }
  }

  trackCliOptionRefreshPeriod(refreshPeriod: string | undefined) {
    if (refreshPeriod) {
      this.trackCliOption({ option: 'refresh-period', value: refreshPeriod });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
