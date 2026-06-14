import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesSubcommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }

  trackCliSubcommandDelete(actual: string) {
    this.trackCliSubcommand({ subcommand: 'delete', value: actual });
  }
}
