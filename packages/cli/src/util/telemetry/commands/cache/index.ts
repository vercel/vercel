import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { cacheCommand } from '../../../../commands/cache/command';

export class CacheTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof cacheCommand>
{
  trackCliSubcommandPurge(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'purge',
      value: actual,
    });
  }

  trackCliSubcommandInvalidate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'invalidate',
      value: actual,
    });
  }

  trackCliSubcommandDangerouslyDelete(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'dangerously-delete',
      value: actual,
    });
  }
}
