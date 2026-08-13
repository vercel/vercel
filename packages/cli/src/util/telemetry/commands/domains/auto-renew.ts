import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { autoRenewSubcommand } from '../../../../commands/domains/command';

export class DomainsAutoRenewTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof autoRenewSubcommand>
{
  trackCliArgumentDomain(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentState(state: string | undefined) {
    if (state === 'on' || state === 'off') {
      // `state` is a bounded enum (`on`/`off`), so the literal value is safe to record.
      this.trackCliArgument({
        arg: 'state',
        value: state,
      });
    }
  }
}
