import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createApiKeySubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayCreateApiKeyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createApiKeySubcommand>
{
  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBudget(budget: number | undefined) {
    if (budget !== undefined) {
      this.trackCliOption({
        option: 'budget',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRefreshPeriod(refreshPeriod: string | undefined) {
    if (refreshPeriod) {
      this.trackCliOption({
        option: 'refresh-period',
        value: refreshPeriod,
      });
    }
  }

  trackCliFlagIncludeByok(includeByok: boolean | undefined) {
    if (includeByok) {
      this.trackCliFlag('include-byok');
    }
  }
}
