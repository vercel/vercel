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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
