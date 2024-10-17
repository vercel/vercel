import { TelemetryClient } from '../..';

export class AliasLsTelemetryClient extends TelemetryClient {
  trackCliOptionLimit(limit?: number) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
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
