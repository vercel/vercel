import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { aiGatewayCommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof aiGatewayCommand>
{
  trackCliSubcommandApiKeys(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'api-keys',
      value: actual,
    });
  }
}
