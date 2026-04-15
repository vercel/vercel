import { TelemetryClient } from '../..';
import type { listStoresSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobListStoresTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listStoresSubcommand>
{
  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagNoProjects(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-projects');
    }
  }
}
