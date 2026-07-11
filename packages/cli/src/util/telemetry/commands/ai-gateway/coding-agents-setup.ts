import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setupSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayCodingAgentsSetupTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setupSubcommand>
{
  trackCliOptionAgent(agents: [string] | undefined) {
    if (agents && agents.length) {
      for (const agent of agents) {
        this.trackCliOption({ option: 'agent', value: agent });
      }
    }
  }

  trackCliFlagAll(all: boolean | undefined) {
    if (all) {
      this.trackCliFlag('all');
    }
  }

  trackCliOptionKey(key: string | undefined) {
    if (key) {
      this.trackCliOption({ option: 'key', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
