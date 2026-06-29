import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { codingAgentsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayCodingAgentsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof codingAgentsSubcommand>
{
  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }
}
