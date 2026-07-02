import type { TelemetryMethods } from '../../types';
import type { runsSubcommand } from '../../../../commands/agent/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentRunsTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof runsSubcommand>
{
  trackCliOptionSearch(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'search',
        value: this.redactedValue,
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
