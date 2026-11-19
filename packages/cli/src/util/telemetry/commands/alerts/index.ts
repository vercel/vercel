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

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandAcknowledged(actual: string) {
    this.trackCliSubcommand({ subcommand: 'acknowledged', value: actual });
  }

  trackCliSubcommandMuted(actual: string) {
    this.trackCliSubcommand({ subcommand: 'muted', value: actual });
  }

  trackCliSubcommandAcknowledge(actual: string) {
    this.trackCliSubcommand({ subcommand: 'acknowledge', value: actual });
  }

  trackCliSubcommandUnacknowledge(actual: string) {
    this.trackCliSubcommand({ subcommand: 'unacknowledge', value: actual });
  }

  trackCliSubcommandMute(actual: string) {
    this.trackCliSubcommand({ subcommand: 'mute', value: actual });
  }

  trackCliSubcommandUnmute(actual: string) {
    this.trackCliSubcommand({ subcommand: 'unmute', value: actual });
  }

  trackCliArgumentGroup(v: string | undefined) {
    if (v) {
      this.trackCliArgument({ arg: 'group', value: this.redactedValue });
    }
  }

  trackCliOptionDuration(v: string | undefined) {
    if (v) {
      const value = v.trim().toLowerCase();
      this.trackCliOption({
        option: 'duration',
        value: /^[0-9a-z. ]{1,16}$/.test(value) ? value : this.redactedValue,
      });
    }
  }

  trackCliOptionDetection(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'detection', value: this.redactedValue });
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

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagAi(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('ai');
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

  trackCliOptionNext(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
