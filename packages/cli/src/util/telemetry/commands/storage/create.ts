import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createSubcommand } from '../../../../commands/storage/command';
import { getStorageProvider } from '../../../storage/providers';

export class StorageCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
{
  trackCliArgumentName(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionType(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'type',
        value: getStorageProvider(v)?.type ?? this.redactedValue,
      });
    }
  }

  trackCliOptionAccess(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'access',
        value: ['public', 'private'].includes(v) ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionRegion(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'region',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionItems(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'items',
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
