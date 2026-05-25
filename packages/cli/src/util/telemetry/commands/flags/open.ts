import { TelemetryClient } from '../..';
import type { openSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

export class FlagsOpenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof openSubcommand>
{
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }
}
