import type { aliasCommand } from '../../../../commands/alias/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class AliasTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof aliasCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'set',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }
}
