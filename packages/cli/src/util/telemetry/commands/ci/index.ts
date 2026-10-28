import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { ciCommand } from '../../../../commands/ci/command';

export class CiTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof ciCommand>
{
  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'enable',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandLogs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'logs',
      value: actual,
    });
  }

  trackCliSubcommandGrep(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'grep',
      value: actual,
    });
  }

  trackCliSubcommandRerun(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rerun',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
