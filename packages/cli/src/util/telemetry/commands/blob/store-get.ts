import { TelemetryClient } from '../..';
import type { getStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobGetStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getStoreSubcommand>
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
