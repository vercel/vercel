import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/agent-runs/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentRunsListTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionQuery(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'query',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionSearch(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'search',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(value: string | undefined) {
    if (value !== undefined) {
      // A legacy page number is safe to record; a cursor is not.
      this.trackCliOption({
        option: 'next',
        value: /^\d+$/.test(value) ? value : this.redactedValue,
      });
    }
  }

  trackCliOptionPage(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'page',
        value: String(value),
      });
    }
  }

  trackCliOptionLimit(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: String(value),
      });
    }
  }
}
