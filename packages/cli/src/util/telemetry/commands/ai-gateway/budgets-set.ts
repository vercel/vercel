import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsSetSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsSetSubcommand>
{
  trackCliArgumentScope(scope: string | undefined) {
    if (scope) {
      this.trackCliArgument({ arg: 'scope', value: scope });
    }
  }

  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({ arg: 'name', value: this.redactedValue });
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

  trackCliFlagDefault(defaultValue: boolean | undefined) {
    if (defaultValue) {
      this.trackCliFlag('default');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
