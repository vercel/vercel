import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedInspectSubcommand } from '../../../../commands/env/command';

export class EnvSharedInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedInspectSubcommand>
{
  trackCliArgumentNameOrId(nameOrId: string | undefined) {
    if (nameOrId) {
      this.trackCliArgument({
        arg: 'name-or-id',
        value: this.redactedValue,
      });
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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
