import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { initSubcommand } from '../../../../commands/agent/command';

export class AgentInitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof initSubcommand>
{
  trackCliFlagYes(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes');
    }
  }
}
