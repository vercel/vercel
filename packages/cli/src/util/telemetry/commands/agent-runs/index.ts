import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { agentRunsCommand } from '../../../../commands/agent-runs/command';

export class AgentRunsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof agentRunsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandTrace(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'trace',
      value: actual,
    });
  }

  trackCliSubcommandProjects(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'projects',
      value: actual,
    });
  }
}
