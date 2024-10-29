import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { initCommand } from '../../../../commands/init/command';

export class InitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof initCommand>
{
  trackCliArgumentExample(v: string | undefined, knownValue?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'example',
        value: knownValue ? v : this.redactedValue,
      });
    }
  }

  trackCliArgumentDir(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'dir',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagForce(v?: boolean) {
    if (v) {
      this.trackCliFlag('force');
    }
  }
}
