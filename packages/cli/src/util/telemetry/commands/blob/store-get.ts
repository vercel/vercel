import { BlobAuthTelemetryClient } from './auth';
import type { getStoreInfoSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobGetStoreTelemetryClient
  extends BlobAuthTelemetryClient
  implements TelemetryMethods<typeof getStoreInfoSubcommand>
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
