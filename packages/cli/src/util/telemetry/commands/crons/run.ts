import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { runSubcommand } from '../../../../commands/crons/command';

export class CronsRunTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof runSubcommand>
{
  trackCliArgumentPath(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'path',
        value: this.redactedValue,
      });
    }
  }
}
