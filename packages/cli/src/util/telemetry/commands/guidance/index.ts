import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { guidanceCommand } from '../../../../commands/guidance/command';

export class GuidanceTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof guidanceCommand>
{
  trackCliSubcommandStatus(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: actual,
    });
  }

  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'enable',
      value: actual,
    });
  }

  trackCliSubcommandDisable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disable',
      value: actual,
    });
  }
}
