import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeCommand } from '../../../../commands/remove/command';

export class RemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeCommand>
{
  trackCliFlagHard(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('hard');
    }
  }

  trackCliFlagSafe(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('safe');
    }
  }

  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
