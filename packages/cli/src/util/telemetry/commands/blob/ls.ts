import { TelemetryClient } from '../..';
import type { listSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCursor(cursor: string | undefined) {
    if (cursor) {
      this.trackCliOption({
        option: 'cursor',
        value: this.redactedValue,
      });
    }
  }
}
