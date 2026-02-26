import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { activityCommand } from '../../../../commands/activity/command';

export class ActivityTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof activityCommand>
{
  trackCliSubcommandLs(v: string | undefined) {
    if (v) {
      this.trackCliSubcommand({
        subcommand: 'ls',
        value: v,
      });
    }
  }

  trackCliSubcommandTypes(v: string | undefined) {
    if (v) {
      this.trackCliSubcommand({
        subcommand: 'types',
        value: v,
      });
    }
  }
}
