import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { disconnectSubcommand } from '../../../../commands/storage/command';

export class StorageDisconnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof disconnectSubcommand>
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

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
