import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { cronsCommand } from '../../../../commands/crons/command';

export class CronsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof cronsCommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandRun(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'run',
      value: actual,
    });
  }
}
