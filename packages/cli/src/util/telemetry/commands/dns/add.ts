import { TelemetryClient } from '../..';

export class DnsAddTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(domain?: string) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
  trackCliArgumentName(name?: string) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }
  trackCliArgumentType(type?: string) {
    if (type) {
      this.trackCliArgument({
        arg: 'type',
        value: type,
      });
    }
  }
  trackCliArgumentValues(values?: string[]) {
    if (values && values.length) {
      this.trackCliArgument({
        arg: 'values',
        value: this.redactedValue,
      });
    }
  }
}
