import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { buildCommand } from '../../../../commands/build/command';

export class BuildTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buildCommand>
{
  trackCliOptionOutput(path?: string) {
    if (path) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTarget(option?: string) {
    if (option) {
      this.trackCliOption({
        option: 'target',
        value: option,
      });
    }
  }

  trackCliFlagProd(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
