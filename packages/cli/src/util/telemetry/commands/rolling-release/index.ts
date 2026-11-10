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

  trackCliOptionDeployment(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'deployment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDpl(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'dpl',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCurrentStageIndex(value: string | undefined) {
    this.trackCliOption({
      option: 'currentStageIndex',
      value: value ?? '',
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandStart(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'start',
      value: actual,
    });
  }

  trackCliSubcommandApprove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'approve',
      value: actual,
    });
  }

  trackCliSubcommandAbort(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'abort',
      value: actual,
    });
  }

  trackCliSubcommandComplete(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'complete',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliFlagEnable(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('enable');
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagNoEnable(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-enable');
    }
  }

  /** The old name of `--no-enable`. */
  trackCliFlagDisable(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('disable');
    }
  }

  trackCliOptionAdvancementType(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'advancement-type',
        value,
      });
    }
  }

  trackCliOptionStage(value: string[] | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'stage',
        value: value.join(','),
      });
    }
  }
}
