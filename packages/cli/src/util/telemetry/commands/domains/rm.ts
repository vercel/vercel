import type { removeSubcommand } from '../../../../commands/domains/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class DomainsRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentDomain(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
