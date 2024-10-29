import { TelemetryClient } from '../..';

export class LogsTelemetryClient extends TelemetryClient {
  trackCliArgumentUrl(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'url',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagFollow(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('follow');
    }
  }

  trackCliOptionLimit(n: number | undefined) {
    if (typeof n === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(n: string | undefined) {
    if (n) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(n: string | undefined) {
    if (n) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOutput(n: string | undefined, known: boolean | undefined) {
    if (n) {
      this.trackCliOption({
        option: 'output',
        value: known ? n : this.redactedValue,
      });
    }
  }
}
