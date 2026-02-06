import type { removeSubcommand } from '../../../../commands/dns/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

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
