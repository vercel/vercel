import type { purgeSubcommand } from '../../../../commands/cache/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class CachePurgeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof purgeSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({
        option: 'type',
        value: type,
      });
    }
  }
}
