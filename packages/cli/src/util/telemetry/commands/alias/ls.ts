import { TelemetryClient } from '../..';

export class AliasLsTelemetryClient extends TelemetryClient {
  trackCliOptionLimit(limit?: number) {
    if (limit) {
      this.trackCliOption({
        flag: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionNext(next?: number) {
    if (next) {
      this.trackCliOption({
        flag: 'next',
        value: '[REDACTED]',
      });
    }
  }
}
