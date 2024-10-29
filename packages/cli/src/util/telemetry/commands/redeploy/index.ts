import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { redeployCommand } from '../../../../commands/redeploy/command';

export class RedeployTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof redeployCommand>
{
  trackCliArgumentDeploymentIdOrName(idOrName?: string) {
    if (idOrName) {
      this.trackCliArgument({
        arg: 'idOrName',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoWait(noWait: boolean | undefined) {
    if (noWait) {
      this.trackCliFlag('no-wait');
    }
  }
}
