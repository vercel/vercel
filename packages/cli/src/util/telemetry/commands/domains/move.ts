import { TelemetryClient } from '../..';

export class DomainsMoveTelemetryClient extends TelemetryClient {
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentDomainName(domainName: string | undefined) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentDestination(destination: string | undefined) {
    if (destination) {
      this.trackCliArgument({
        arg: 'destination',
        value: this.redactedValue,
      });
    }
  }
}
