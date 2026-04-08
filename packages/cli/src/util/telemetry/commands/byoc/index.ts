import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { byocCommand } from '../../../../commands/byoc/command';

export class ByocTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof byocCommand>
{
  trackCliSubcommandInit(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'init',
      value: actual,
    });
  }

  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }
}
