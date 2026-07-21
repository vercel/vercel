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

  trackCliFlagIncludeByok(includeByok: boolean | undefined) {
    if (includeByok) {
      this.trackCliFlag('include-byok');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
