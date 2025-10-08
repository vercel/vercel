import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeSubcommand } from '../../../../commands/dns/command';

export class DnsRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentId(recordId: string | undefined) {
    if (recordId) {
      this.trackCliArgument({
        arg: 'recordId',
        value: this.redactedValue,
      });
    }
  }
}
