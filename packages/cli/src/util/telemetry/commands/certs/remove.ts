import type { removeSubcommand } from '../../../../commands/certs/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class CertsRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }
}
