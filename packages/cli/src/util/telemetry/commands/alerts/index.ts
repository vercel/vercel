import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { alertsCommand } from '../../../../commands/alerts/command';

export class AlertsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof alertsCommand>
{
  trackCliSubcommandLs(v: string | undefined) {
    if (v) {
      this.trackCliSubcommand({
        subcommand: 'ls',
        value: v,
      });
    }
  }

  trackCliOptionType(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({
        option: 'type',
        value: v.join(','),
      });
    }
  }

  trackCliOptionSince(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliOptionLimit(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }
}
