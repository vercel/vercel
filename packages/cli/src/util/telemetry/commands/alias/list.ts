import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/alias/command';

export class AliasListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionNext(next: number | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
