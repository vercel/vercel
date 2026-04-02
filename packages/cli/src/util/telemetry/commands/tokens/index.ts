import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { tokensCommand } from '../../../../commands/tokens/command';

export class TokensTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tokensCommand>
{
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
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
