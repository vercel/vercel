import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { contractCommand } from '../../../../commands/contract/command';

export class ContractTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof contractCommand>
{
  trackCliOptionFormat(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'format',
        value,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionTo(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'to',
        value,
      });
    }
  }
}
