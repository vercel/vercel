import { TelemetryClient } from './';

export class TelemetryBaseClient extends TelemetryClient {
  trackCliCommandDomains(actual: string) {
    this.trackCliCommand({
      command: 'domains',
      value: actual,
    });
  }
}
