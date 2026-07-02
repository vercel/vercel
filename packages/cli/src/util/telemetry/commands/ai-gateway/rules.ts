import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesSubcommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({ subcommand: 'add', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandEdit(actual: string) {
    this.trackCliSubcommand({ subcommand: 'edit', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }
}
