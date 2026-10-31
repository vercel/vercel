import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsSetSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsSetSubcommand>
{
  trackCliArgumentScope(scope: string | undefined) {
    if (scope) {
      this.trackCliArgument({ arg: 'scope', value: scope });
    }
  }

  trackCliOptionAmount(amount: number | undefined) {
    if (amount !== undefined) {
      this.trackCliOption({ option: 'amount', value: this.redactedValue });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
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
