import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { getSubcommand } from '../../../../commands/global-config/command';

export class GlobalConfigGetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
