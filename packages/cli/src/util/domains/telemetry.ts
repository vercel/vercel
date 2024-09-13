import { TelemetryClient } from '../telemetry';

export class DomainsAddTelemetryClient extends TelemetryClient {
  trackArgumentDomain() {
    this.trackCliArgument('domain', '[SECRET]');
  }

  trackFlagForce(passed: boolean | undefined) {
    this.trackCliBooleanFlag('force', passed);
  }
}
