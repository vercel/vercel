import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLogsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsSubcommand>
{
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }
}
