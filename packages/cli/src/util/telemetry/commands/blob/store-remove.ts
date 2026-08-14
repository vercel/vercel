import { TelemetryClient } from '../..';
import type { deleteStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobRemoveStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof deleteStoreSubcommand>
{
  trackCliArgumentStoreId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'storeId',
        value,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
