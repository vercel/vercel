import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/storage/command';
import { getStorageProvider } from '../../../storage/providers';

export class StorageListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionType(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'type',
        value: getStorageProvider(v)?.type ?? this.redactedValue,
      });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
