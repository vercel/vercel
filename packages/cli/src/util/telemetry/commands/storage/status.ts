import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { statusSubcommand } from '../../../../commands/storage/command';

export class StorageStatusTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof statusSubcommand>
{
  trackCliArgumentStore(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'store',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
