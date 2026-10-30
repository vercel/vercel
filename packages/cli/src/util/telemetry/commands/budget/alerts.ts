import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { alertsSubcommand } from '../../../../commands/budget/command';

export class BudgetAlertsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof alertsSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliOptionSince(since: string | undefined) {
    if (since) {
      this.trackCliOption({ option: 'since', value: this.redactedValue });
    }
  }

  trackCliOptionUntil(until: string | undefined) {
    if (until) {
      this.trackCliOption({ option: 'until', value: this.redactedValue });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
