import { TelemetryClient } from '../..';

export class DomainsBuyTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
