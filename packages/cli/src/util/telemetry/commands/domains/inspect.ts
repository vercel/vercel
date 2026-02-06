import type { inspectSubcommand } from '../../../../commands/domains/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class DomainsInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentDomain(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
