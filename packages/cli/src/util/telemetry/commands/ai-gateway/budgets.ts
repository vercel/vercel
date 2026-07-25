import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsSubcommand>
{
  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'set', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }
}
