import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import { getStorageProvider } from '../../../storage/providers';
import type { getSubcommand } from '../../../../commands/storage/command';

export class StorageGetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
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

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
