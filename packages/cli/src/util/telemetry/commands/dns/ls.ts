import { TelemetryClient } from '../..';

export class DnsLsTelemetryClient extends TelemetryClient {
  trackArgumentDomainName(domainName?: string) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domainName',
        value: this.redactedValue,
      });
    }
  }

  trackOptionLimit(limit?: number) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackOptionNext(next?: number) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
