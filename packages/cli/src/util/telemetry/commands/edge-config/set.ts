import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliArgumentKey(value: string | undefined) {
    this.trackCliArgument({ arg: 'key', value });
  }

  trackCliOptionValue(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'value', value: this.redactedValue });
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
