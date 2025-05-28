import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rollingReleaseCommand } from '../../../../commands/rolling-release/command';

export class RollingReleaseTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rollingReleaseCommand>
{
  trackCliArgumentProjectPath(projectPaths: string | undefined) {
    if (projectPaths) {
      this.trackCliArgument({
        arg: 'project-path',
        value: this.redactedValue,
      });
    }
  }

  trackCliSubcommandStatus() {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: 'status',
    });
  }

  trackCliOptionTimeout(time: string | undefined) {
    if (time) {
      this.trackCliOption({
        option: 'timeout',
        value: '[TIME]',
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

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
