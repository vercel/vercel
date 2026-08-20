import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { securityCommand } from '../../../../commands/security/command';

export class SecurityTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof securityCommand>
{
  trackCliSubcommandCheck(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'check',
      value: actual,
    });
  }
}
