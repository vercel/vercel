import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayApiKeysCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
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
