import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { tunnelCommand } from '../../../../commands/tunnel/command';

export class TunnelTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tunnelCommand>
{
  trackCliOptionPort(port: number | undefined) {
    if (port) {
      this.trackCliOption({
        option: 'port',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagProd(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }
}
