import { TelemetryClient } from '../..';
import type { listStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobStoreListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listStoreSubcommand>
{
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
