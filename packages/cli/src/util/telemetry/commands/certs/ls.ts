import { TelemetryClient } from '../..';

export class CertsLsTelemetryClient extends TelemetryClient {
  trackCliOptionLimit(limit?: number) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(next?: number) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
