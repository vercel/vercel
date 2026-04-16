import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliOptionSlug(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'slug', value: this.redactedValue });
    }
  }

  trackCliOptionPatch(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'patch', value: this.redactedValue });
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
