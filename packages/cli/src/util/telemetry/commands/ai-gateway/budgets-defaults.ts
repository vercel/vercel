import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsSubcommand>
{
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'set', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }
}
