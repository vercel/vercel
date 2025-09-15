import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { invalidateSubcommand } from '../../../../commands/cache/command';

export class CacheInvalidateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof invalidateSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionTag(tag: string | undefined) {
    if (tag) {
      this.trackCliOption({
        option: 'tag',
        value: tag,
      });
    }
  }
}
