import { TelemetryClient } from '../..';

export class DomainsRmTelemetryClient extends TelemetryClient {
  trackCliArgumentDomain(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v?: boolean) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }
}
