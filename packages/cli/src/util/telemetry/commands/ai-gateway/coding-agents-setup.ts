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

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({ option: 'name', value: this.redactedValue });
    }
  }

  trackCliFlagReconfigure(reconfigure: boolean | undefined) {
    if (reconfigure) {
      this.trackCliFlag('reconfigure');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
