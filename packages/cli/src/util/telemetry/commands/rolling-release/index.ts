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

  trackCliOptionDpl(value: string | undefined) {
    this.trackCliOption({
      option: 'dpl',
      value: value ?? '',
    });
  }

  trackCliOptionCurrentStageIndex(value: string | undefined) {
    this.trackCliOption({
      option: 'currentStageIndex',
      value: value ?? '',
    });
  }

  trackCliSubcommandConfigure(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'configure',
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

  trackCliSubcommandFetch(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'fetch',
      value: actual,
    });
  }
}
