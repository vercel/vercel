import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { tokensCommand } from '../../../../commands/tokens/command';

export class TokensTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tokensCommand>
{
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandRevoke(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'revoke',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
