import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/agent-runs/command';
import { AgentRunsQueryTelemetryClient } from './shared';

export class AgentInspectTelemetryClient
  extends AgentRunsQueryTelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentRunId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'runId',
        value: this.redactedValue,
      });
    }
  }
}
