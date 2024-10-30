import { TelemetryClient } from '../..';

export class CertsRemoveTelemetryClient extends TelemetryClient {
  trackCliArgumentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }
}
