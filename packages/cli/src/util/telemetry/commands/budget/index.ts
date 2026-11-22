import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetCommand } from '../../../../commands/budget/command';

export class BudgetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetCommand>
{
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({ subcommand: 'set', value: actual });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({ subcommand: 'remove', value: actual });
  }

  trackCliSubcommandAlerts(actual: string) {
    this.trackCliSubcommand({ subcommand: 'alerts', value: actual });
  }
}
