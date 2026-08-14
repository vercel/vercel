import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { modelsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayModelsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof modelsSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandEndpoints(actual: string) {
    this.trackCliSubcommand({ subcommand: 'endpoints', value: actual });
  }
}
