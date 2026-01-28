import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { agentsCommand } from '../../../../commands/agents/command';

export class AgentsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof agentsCommand>
{
  trackCliSubcommandInit(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'init',
      value: actual,
    });
  }

  trackCliArgumentFormat(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'format',
        value,
      });
    }
  }

  trackCliFlagForce(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('force');
    }
  }

  trackCliFlagDryRun(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('dry-run');
    }
  }

  trackAgentFileGenerated(format: string, framework: string | null) {
    this.trackCliOption({
      option: 'agent_file_generated',
      value: format,
    });
    if (framework) {
      this.trackCliOption({
        option: 'agent_file_framework',
        value: framework,
      });
    }
  }

  trackAgentFileSkipped(reason: string) {
    this.trackCliOption({
      option: 'agent_file_skipped',
      value: reason,
    });
  }
}
