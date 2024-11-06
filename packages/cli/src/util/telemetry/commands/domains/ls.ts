import { TelemetryClient } from '../..';

export class DomainsLsTelemetryClient extends TelemetryClient {
  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(next: number | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }
}
