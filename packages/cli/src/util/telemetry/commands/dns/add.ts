import { TelemetryClient } from '../..';

export class DnsAddTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(domain: string | undefined) {
    if (domain) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }
  trackCliArgumentType(type: string | undefined) {
    if (type) {
      this.trackCliArgument({
        arg: 'type',
        value: type,
      });
    }
  }
  trackCliArgumentValues(values: string[] | undefined) {
    if (values?.length) {
      this.trackCliArgument({
        arg: 'values',
        value: this.redactedValue,
      });
    }
  }
}
