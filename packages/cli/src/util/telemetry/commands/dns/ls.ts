import { TelemetryClient } from '../..';

export class DnsLsTelemetryClient extends TelemetryClient {
  trackCliArgumentDomainName(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domainName',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(next: number | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
