import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { accountCommand } from '../../../../commands/account/command';

export class AccountTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof accountCommand>
{
  trackCliSubcommandCreate(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'create',
        value: actual,
      });
    }
  }
}
