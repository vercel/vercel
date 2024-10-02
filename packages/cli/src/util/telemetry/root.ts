import { TelemetryClient } from '.';

export class RootTelemetryClient extends TelemetryClient {
  trackCliCommandDomains(actual: string) {
    this.trackCliCommand({
      command: 'domains',
      value: actual,
    });
  }
}
