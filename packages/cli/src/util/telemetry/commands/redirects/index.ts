import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { redirectsCommand } from '../../../../commands/redirects/command';

export class RedirectsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof redirectsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandListVersions(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list-versions',
      value: actual,
    });
  }

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

  trackCliSubcommandPromote(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'promote',
      value: actual,
    });
  }

  trackCliSubcommandRestore(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'restore',
      value: actual,
    });
  }
}
