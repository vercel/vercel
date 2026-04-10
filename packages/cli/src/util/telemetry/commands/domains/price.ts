import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { priceSubcommand } from '../../../../commands/domains/command';

export class DomainsPriceTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof priceSubcommand>
{
  trackCliArgumentDomain(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }
}
