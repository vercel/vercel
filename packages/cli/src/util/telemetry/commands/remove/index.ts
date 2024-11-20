import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeCommand } from '../../../../commands/remove/command';

export class RemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeCommand>
{
  trackCliArgumentNameOrDeploymentId(values: string[]) {
    if (values) {
      this.trackCliArgument({
        arg: 'nameOrDeploymentId',
        value: this.redactedArgumentsLength(values),
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
