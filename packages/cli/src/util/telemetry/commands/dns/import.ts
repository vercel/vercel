import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { importSubcommand } from '../../../../commands/dns/command';

export class DnsImportTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof importSubcommand>
{
  trackCliArgumentDomain(domain: string | undefined) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentZonefile(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'zoneFilePath',
        value: this.redactedValue,
      });
    }
  }
}
