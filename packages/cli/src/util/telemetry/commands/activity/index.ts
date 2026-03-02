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

  trackCliOptionNext(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
