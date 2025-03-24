import { TelemetryClient } from '../..';
import type { blobCommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof blobCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
