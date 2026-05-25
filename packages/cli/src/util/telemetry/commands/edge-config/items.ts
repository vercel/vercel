import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { itemsSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigItemsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof itemsSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliOptionKey(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'key', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }
}
