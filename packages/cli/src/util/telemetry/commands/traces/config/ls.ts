import { TelemetryClient } from '../../../';
import type { TelemetryMethods } from '../../../types';
import type { lsSubcommand } from '../../../../../commands/traces/config/command';

export class TracesConfigLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof lsSubcommand>
{
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
