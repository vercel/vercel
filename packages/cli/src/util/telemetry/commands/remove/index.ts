import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeCommand } from '../../../../commands/remove/command';

export class RemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeCommand>
{
  trackCliArgumentUrlOrDeploymentId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagHard(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('hard');
    }
  }

  trackCliFlagSafe(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('safe');
    }
  }

  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
