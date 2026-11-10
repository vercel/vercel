import { TelemetryClient } from '../..';

export class FlagsStaleTelemetryClient extends TelemetryClient {
  trackCliOptionStaleAfter(staleAfter: string | undefined) {
    if (staleAfter) {
      this.trackCliOption({
        option: 'stale-after',
        value: staleAfter,
      });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
