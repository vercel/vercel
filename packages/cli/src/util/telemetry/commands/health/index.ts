import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { healthCommand } from '../../../../commands/health/command';

export class HealthTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof healthCommand>
{
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
