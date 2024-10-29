import { TelemetryClient } from '../..';

export class DomainsAddTelemetryClient extends TelemetryClient {
  trackCliFlagForce(force: boolean | undefined) {
    if (force) {
      this.trackCliFlag('force');
    }
  }

  trackCliArgumentDomainName(domainName: string) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProjectName(projectName: string | undefined) {
    if (projectName) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }
}
