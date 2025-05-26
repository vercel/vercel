import { TelemetryClient } from '../..';
import type { removeStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobRemoveStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeStoreSubcommand>
{
  trackCliArgumentStoreId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'storeId',
        value,
      });
    }
  }
}
