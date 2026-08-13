import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { renewSubcommand } from '../../../../commands/domains/command';

export class DomainsRenewTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof renewSubcommand>
{
  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
