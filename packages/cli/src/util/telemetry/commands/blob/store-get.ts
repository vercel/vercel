import { TelemetryClient } from '../..';
import type { getStoreInfoSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobGetStoreTelemetryClient
  extends TelemetryClient
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
