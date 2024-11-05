import { TelemetryClient } from '../..';

export class DomainsBuyTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
