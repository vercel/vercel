import type { buildCommand } from '../../../../commands/build/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class BuildTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buildCommand>
{
  trackCliOptionOutput(path: string | undefined) {
    if (path) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTarget(option: string | undefined) {
    if (option) {
      this.trackCliOption({
        option: 'target',
        value: this.redactedTargetName(option),
      });
    }
  }

  trackCliFlagProd(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagStandalone(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('standalone');
    }
  }
}
