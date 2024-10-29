import { TelemetryClient } from '../..';

export class DomainsMoveTelemetryClient extends TelemetryClient {
  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentDomainName(domainName?: string) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentDestination(destination?: string) {
    if (destination) {
      this.trackCliArgument({
        arg: 'destination',
        value: this.redactedValue,
      });
    }
  }
}
