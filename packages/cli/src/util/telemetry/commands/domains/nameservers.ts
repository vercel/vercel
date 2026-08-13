import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { nameserversSubcommand } from '../../../../commands/domains/command';

export class DomainsNameserversTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof nameserversSubcommand>
{
  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSet(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'set',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagRestore(restore: boolean | undefined) {
    if (restore) {
      this.trackCliFlag('restore');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
