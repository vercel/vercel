import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/crons/command';

export class CronsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliOptionPath(path: string | undefined) {
    if (path) {
      this.trackCliOption({
        option: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSchedule(schedule: string | undefined) {
    if (schedule) {
      this.trackCliOption({
        option: 'schedule',
        value: this.redactedValue,
      });
    }
  }
}
