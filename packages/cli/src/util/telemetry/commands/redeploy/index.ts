import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { redeployCommand } from '../../../../commands/redeploy/command';

export class RedeployTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof redeployCommand>
{
  trackCliArgumentUrlOrDeploymentId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoWait(noWait: boolean | undefined) {
    if (noWait) {
      this.trackCliFlag('no-wait');
    }
  }

  trackCliOptionTarget(target: string | undefined) {
    if (target) {
      this.trackCliArgument({
        arg: 'target',
        value: this.redactedTargetName(target),
      });
    }
  }
}
