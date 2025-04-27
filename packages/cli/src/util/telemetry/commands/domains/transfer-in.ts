import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { transferInSubcommand } from '../../../../commands/domains/command';

export class DomainsTransferInTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof transferInSubcommand>
{
  trackCliOptionCode(code: string | undefined) {
    if (code) {
      this.trackCliOption({
        option: 'code',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
