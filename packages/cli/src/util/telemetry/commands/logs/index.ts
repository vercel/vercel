import { TelemetryClient } from '../..';

export class LogsTelemetryClient extends TelemetryClient {
  trackCliArgumentUrl(path?: string) {
    if (path) {
      this.trackCliArgument({
        arg: 'url',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(v?: boolean) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagFollow(v?: boolean) {
    if (v) {
      this.trackCliFlag('follow');
    }
  }

  trackCliOptionLimit(n?: number) {
    if (typeof n === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(n?: string) {
    if (n) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(n?: string) {
    if (n) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOutput(n?: string, valid?: boolean) {
    if (n) {
      this.trackCliOption({
        option: 'output',
        value: valid ? n : this.redactedValue,
      });
    }
  }
}
