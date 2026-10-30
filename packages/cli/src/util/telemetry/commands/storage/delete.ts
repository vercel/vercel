import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import { getStorageProvider } from '../../../storage/providers';
import type { deleteSubcommand } from '../../../../commands/storage/command';

export class StorageDeleteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof deleteSubcommand>
{
  trackCliOptionType(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'type',
        value: getStorageProvider(v)?.type ?? this.redactedValue,
      });
    }
  }

  trackCliArgumentStore(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'store',
        value: this.redactedValue,
      });
    }
  }
}
