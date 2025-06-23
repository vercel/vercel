import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { purgeSubcommand } from '../../../../commands/cache/command';

export class CachePurgeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof purgeSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
