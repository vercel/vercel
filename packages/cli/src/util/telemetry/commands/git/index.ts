import type { gitCommand } from '../../../../commands/git/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class GitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof gitCommand>
{
  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }

  trackCliSubcommandDisconnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disconnect',
      value: actual,
    });
  }
}
