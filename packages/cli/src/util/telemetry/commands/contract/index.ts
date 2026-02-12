import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { contractCommand } from '../../../../commands/contract/command';

export class ContractTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof contractCommand>
{
  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
