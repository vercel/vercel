import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'slug', value });
  }

  trackCliOptionItems(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'items', value: this.redactedValue });
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
