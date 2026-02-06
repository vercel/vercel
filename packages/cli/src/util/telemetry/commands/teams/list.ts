import type { listSubcommand } from '../../../../commands/teams/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class TeamsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionNext(value: number | undefined) {
    if (value && value > 0) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCount(value: number | undefined) {
    if (value && value > 0) {
      this.trackCliOption({
        option: 'count',
        value: this.redactedValue,
      });
    }
  }
}
