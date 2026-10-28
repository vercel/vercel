import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pricingCommand } from '../../../../commands/pricing/command';

export class PricingTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pricingCommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliArgumentQuery(query: string[] | undefined) {
    if (query && query.length > 0) {
      this.trackCliArgument({
        arg: 'query',
        value: this.redactedValue,
      });
    }
  }
}
