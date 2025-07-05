import { TelemetryClient } from '../..';
import type { addStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobAddStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addStoreSubcommand>
{
  trackCliArgumentName(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRegion(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'region',
        value: this.redactedValue,
      });
    }
  }
}
