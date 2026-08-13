import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { authCodeSubcommand } from '../../../../commands/domains/command';

export class DomainsAuthCodeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof authCodeSubcommand>
{
  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
