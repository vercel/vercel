import { TelemetryClient } from '../..';

export class InitTelemetryClient extends TelemetryClient {
  trackCliArgumentExample(v: string, knownValue: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'example',
        value: knownValue ? v : this.redactedValue,
      });
    }
  }

  trackCliArgumentDir(v?: string) {
    if (v) {
      this.trackCliArgument({
        arg: 'dir',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagForce(v?: boolean) {
    if (v) {
      this.trackCliFlag('force');
    }
  }
}
