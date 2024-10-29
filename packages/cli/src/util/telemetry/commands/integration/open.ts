import { TelemetryClient } from '../..';

export class IntegrationOpenTelemetryClient extends TelemetryClient {
  trackCliArgumentName(v: string, known?: boolean) {
    this.trackCliArgument({
      arg: 'name',
      value: known ? v : this.redactedValue,
    });
  }
}
