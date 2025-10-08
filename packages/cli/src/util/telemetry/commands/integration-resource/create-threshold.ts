import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createThresholdSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceCreateThresholdTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createThresholdSubcommand>
{
  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentMinimum(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'minimum',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentSpend(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'spend',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentLimit(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
