import { TelemetryClient } from '../..';

export class DnsLsTelemetryClient extends TelemetryClient {
  trackCliArgumentDomainName(domainName?: string) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domainName',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLimit(limit?: number) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(next?: number) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
