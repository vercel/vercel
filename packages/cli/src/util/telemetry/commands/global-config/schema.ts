import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { schemaSubcommand } from '../../../../commands/global-config/command';

export class GlobalConfigSchemaTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof schemaSubcommand>
{
  trackCliArgumentAction(value: string | undefined) {
    // Only known actions are recorded; unknown input is dropped so we never
    // capture arbitrary user-supplied strings.
    this.trackCliArgument({ arg: 'action', value });
  }

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
