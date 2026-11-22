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

  trackCliOptionAmount(amount: number | undefined) {
    if (amount !== undefined) {
      this.trackCliOption({
        option: 'amount',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated names keep their own keys, to measure who still uses them.
  trackCliOptionBudget(budget: number | undefined) {
    if (budget !== undefined) {
      this.trackCliOption({
        option: 'budget',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({
        option: 'limit',
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

  trackCliOptionAlertThresholds(alertThresholds: string | undefined) {
    if (alertThresholds) {
      this.trackCliOption({
        option: 'alert-thresholds',
        value: alertThresholds,
      });
    }
  }

  trackCliOptionExpiration(expiration: string | undefined) {
    if (expiration) {
      this.trackCliOption({
        option: 'expiration',
        value: expiration,
      });
    }
  }

  trackCliFlagZdrExempt(zdrExempt: boolean | undefined) {
    if (zdrExempt) {
      this.trackCliFlag('zdr-exempt');
    }
  }

  trackCliFlagTokenPass(tokenPass: boolean | undefined) {
    if (tokenPass) {
      this.trackCliFlag('token-pass');
    }
  }

  trackCliFlagBypassAllSettings(bypassAllSettings: boolean | undefined) {
    if (bypassAllSettings) {
      this.trackCliFlag('bypass-all-settings');
    }
  }
}
