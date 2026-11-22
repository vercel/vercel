import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { drainsCommand } from '../../../../commands/drains/command';
import {
  DRAIN_ENVIRONMENTS,
  DRAIN_TYPES,
  LOG_SOURCES,
} from '../../../drains/api';

/** Options whose values come from a closed set, so they're recorded as is. */
const KNOWN_VALUES: Record<string, readonly string[]> = {
  type: DRAIN_TYPES,
  encoding: ['json', 'ndjson', 'proto'],
  source: LOG_SOURCES,
  environment: DRAIN_ENVIRONMENTS,
};

export class DrainsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof drainsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }
  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }
  trackCliSubcommandPause(actual: string) {
    this.trackCliSubcommand({ subcommand: 'pause', value: actual });
  }
  trackCliSubcommandResume(actual: string) {
    this.trackCliSubcommand({ subcommand: 'resume', value: actual });
  }
  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({ subcommand: 'delete', value: actual });
  }

  /**
   * Records which options a subcommand used. Values are redacted unless they
   * come from a closed set: names, URLs, headers, secrets, and projects can
   * hold customer data or credentials.
   */
  trackOptions(flags: Record<string, unknown>) {
    for (const [flag, value] of Object.entries(flags)) {
      if (!flag.startsWith('--') || value === undefined) continue;
      const option = flag.slice(2);
      if (typeof value === 'boolean') {
        if (value) this.trackCliFlag(option);
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      const known = KNOWN_VALUES[option];
      const recorded = values.map(item =>
        known?.includes(String(item)) ? String(item) : this.redactedValue
      );
      this.trackCliOption({
        option,
        value:
          option === 'limit' || option === 'sample-rate'
            ? String(value)
            : recorded.join(','),
      });
    }
  }
}
