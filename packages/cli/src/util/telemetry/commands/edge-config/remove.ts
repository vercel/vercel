import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
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
