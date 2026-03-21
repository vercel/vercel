import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/crons/command';

export class CronsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
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

  trackCliOptionHost(host: string | undefined) {
    if (host) {
      this.trackCliOption({
        option: 'host',
        value: this.redactedValue,
      });
    }
  }
}
