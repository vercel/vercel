import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { discoverSubcommand } from '../../../../commands/integration/command';

export class IntegrationDiscoverTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof discoverSubcommand>
{
  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
