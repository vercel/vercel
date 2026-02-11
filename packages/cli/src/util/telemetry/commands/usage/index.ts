import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { usageCommand } from '../../../../commands/usage/command';

export class UsageTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof usageCommand>
{
  trackCliOptionFrom(from: string | undefined) {
    if (from) {
      this.trackCliOption({
        option: 'from',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTo(to: string | undefined) {
    if (to) {
      this.trackCliOption({
        option: 'to',
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
