import { TelemetryClient } from '../..';

export class BisectTelemetryClient extends TelemetryClient {
  trackCliOptionGood(good?: string) {
    if (good) {
      this.trackCliOption({
        option: 'good',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBad(bad?: string) {
    if (bad) {
      this.trackCliOption({
        option: 'bad',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPath(path?: string) {
    if (path) {
      this.trackCliOption({
        option: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRun(run?: string) {
    if (run) {
      this.trackCliOption({
        option: 'run',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagOpen(open?: boolean) {
    if (open) {
      this.trackCliFlag('open');
    }
  }
}
