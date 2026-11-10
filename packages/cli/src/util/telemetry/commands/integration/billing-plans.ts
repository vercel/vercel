import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { billingPlansSubcommand } from '../../../../commands/integration/command';

export class IntegrationBillingPlansTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof billingPlansSubcommand>
{
  /**
   * Send the canonical slug of the integration the argument resolved to, and
   * leave `known` unset otherwise, so a typo or a guess is never sent.
   */
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionMeta(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'meta',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
