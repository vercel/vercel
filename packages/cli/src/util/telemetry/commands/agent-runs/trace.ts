import type { TelemetryMethods } from '../../types';
import type { traceSubcommand } from '../../../../commands/agent-runs/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentTraceTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof traceSubcommand>
{
  trackCliArgumentRunId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'runId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMaxFieldLength(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'max-field-length',
        value: String(value),
      });
    }
  }
}
