import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { buySubcommand } from '../../../../commands/domains/command';

export class DomainsBuyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buySubcommand>
{
  trackCliArgumentDomain(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
