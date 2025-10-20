import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { dangerouslyDeleteSubcommand } from '../../../../commands/cache/command';

export class CacheDangerouslyDeleteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof dangerouslyDeleteSubcommand>
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

  trackCliOptionRevalidationDeadlineSeconds(seconds: number | undefined) {
    if (seconds) {
      this.trackCliOption({
        option: 'revalidation-deadline-seconds',
        value: seconds?.toString(),
      });
    }
  }
}
