import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { moveSubcommand } from '../../../../commands/domains/command';

export class DomainsMoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof moveSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
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

  trackCliArgumentDestination(destination: string | undefined) {
    if (destination) {
      this.trackCliArgument({
        arg: 'destination',
        value: this.redactedValue,
      });
    }
  }
}
