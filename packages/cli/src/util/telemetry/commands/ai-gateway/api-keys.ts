import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { apiKeysSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayApiKeysTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof apiKeysSubcommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }
}
