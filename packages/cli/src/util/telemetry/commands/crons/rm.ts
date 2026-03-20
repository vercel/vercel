import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rmSubcommand } from '../../../../commands/crons/command';

export class CronsRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rmSubcommand>
{
  trackCliArgumentPath(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag({
        flag: 'yes',
        value: yes,
      });
    }
  }
}
