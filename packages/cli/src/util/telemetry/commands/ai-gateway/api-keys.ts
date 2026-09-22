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

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }
}
