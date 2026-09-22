import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'set', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }
}
