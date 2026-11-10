import { TelemetryClient } from '../..';
import type { emptyStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobEmptyStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof emptyStoreSubcommand>
{
  trackCliFlagYes(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes');
    }
  }
}
