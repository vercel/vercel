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
        value: String(limit),
      });
    }
  }

  trackCliOptionCursor(cursor: string | undefined) {
    if (cursor) {
      this.trackCliOption({
        option: 'cursor',
        value: cursor,
      });
    }
  }

  trackCliOptionPrefix(prefix: string | undefined) {
    if (prefix) {
      this.trackCliOption({
        option: 'prefix',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMode(mode: string | undefined) {
    if (mode) {
      this.trackCliOption({
        option: 'mode',
        value: mode,
      });
    }
  }
}
