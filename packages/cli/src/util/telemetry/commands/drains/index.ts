import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { drainsCommand } from '../../../../commands/drains/command';

export class DrainsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof drainsCommand>
{
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

  trackCliArgumentId(id: string | undefined) {
    if (id) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }
}
