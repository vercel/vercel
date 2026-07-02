import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { agentCommand } from '../../../../commands/agent/command';

export class AgentTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof agentCommand>
{
  trackCliSubcommandInit(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'init',
      value: actual,
    });
  }

  trackCliSubcommandRuns(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'runs',
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
