import { TelemetryClient } from '.';

export class RootTelemtryClient extends TelemetryClient {
  trackCliCommandDomains(actual: string) {
    this.trackCliCommand({
      command: 'domains',
      value: actual,
    });
  }
}
