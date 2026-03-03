import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { agentCommand } from '../../../../commands/agent/command';

export class AgentTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof agentCommand>
{
  trackCliArgumentInit(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'init',
        value,
      });
    }
  }
}
