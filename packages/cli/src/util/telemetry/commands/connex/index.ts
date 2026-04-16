import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connexCommand } from '../../../../commands/connex/command';

export class ConnexTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connexCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }
}
