import { TelemetryClient } from '../..';
import type { storeSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof storeSubcommand>
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

  trackCliSubcommandGet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'get',
      value: actual,
    });
  }
}
