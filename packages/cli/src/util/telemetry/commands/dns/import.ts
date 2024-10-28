import { TelemetryClient } from '../..';

export class DnsImportTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(domain: string) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentZoneFilePath(path: string) {
    if (path) {
      this.trackCliArgument({
        arg: 'zoneFilePath',
        value: this.redactedValue,
      });
    }
  }
}
