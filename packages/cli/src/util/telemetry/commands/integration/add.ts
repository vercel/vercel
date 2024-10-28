import { TelemetryClient } from '../..';

export class IntegrationAddTelemetryClient extends TelemetryClient {
  trackCliArgumentName(v?: string, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: known ? v : this.redactedValue,
      });
    }
  }
}
