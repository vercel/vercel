import { TelemetryClient } from '../..';

export class CertsRemoveTelemetryClient extends TelemetryClient {
  trackCliArgumentId(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }
}
