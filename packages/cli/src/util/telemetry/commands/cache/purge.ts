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

  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({
        option: 'type',
        value: type,
      });
    }
  }
  trackCliOptionTag(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'tag',
        value,
      });
    }
  }
  trackCliOptionStaleWhileRevalidate(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'staleWhileRevalidate',
        value,
      });
    }
  }
  trackCliOptionStaleIfError(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'staleIfError',
        value,
      });
    }
  }
}
