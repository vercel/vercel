import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rollingReleaseCommand } from '../../../../commands/rolling-release/command';

export class RollingReleaseTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rollingReleaseCommand>
{
  trackCliOptionAction(value: string | undefined) {
    this.trackCliOption({
      option: 'action',
      value: value ?? '',
    });
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCfg(value: string | undefined) {
    this.trackCliOption({
      option: 'cfg',
      value: value ?? '',
    });
  }

  trackCliOptionDeployId(value: string | undefined) {
    this.trackCliOption({
      option: 'deployId',
      value: value ?? '',
    });
  }

  trackCliOptionCurrentStageIndex(value: string | undefined) {
    this.trackCliOption({
      option: 'currentStageIndex',
      value: value ?? '',
    });
  }
}
