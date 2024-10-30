import { TelemetryClient } from '../..';

export class IntegrationAddTelemetryClient extends TelemetryClient {
  trackCliArgumentName(v: string | undefined, known: boolean | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: known ? v : this.redactedValue,
      });
    }
  }
}
