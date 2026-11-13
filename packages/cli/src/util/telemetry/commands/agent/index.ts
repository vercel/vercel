import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { agentCommand } from '../../../../commands/agent/command';

export class AgentTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof agentCommand>
{
  trackCliSubcommandInit(actual: string) {
    this.trackCliSubcommand({ subcommand: 'init', value: actual });
  }

  trackCliArgumentInit(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'init',
        value,
      });
    }
  }

  /** Never records the prompt text itself. */
  trackCliArgumentPrompt(value: string | undefined) {
    if (value) {
      this.trackCliArgument({ arg: 'prompt', value: this.redactedValue });
    }
  }

  trackCliMode(mode: 'chat' | 'ask') {
    this.trackCliOption({ option: 'mode', value: mode });
  }

  trackCliOptionSession(value: string | undefined) {
    this.trackRedactedCliOption('session', value);
  }

  trackCliOptionProject(value: string | undefined) {
    this.trackRedactedCliOption('project', value);
  }

  trackCliFlagContinue(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('continue');
    }
  }

  trackCliFlagNew(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('new');
    }
  }

  trackCliFlagApprove(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('approve');
    }
  }

  trackCliFlagReject(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('reject');
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagStream(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('stream');
    }
  }

  trackCliFlagYes(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes');
    }
  }
}
