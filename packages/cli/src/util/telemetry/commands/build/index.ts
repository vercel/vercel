import { TelemetryClient } from '../..';

export class BuildTelemetryClient extends TelemetryClient {
  trackCliOptionOutput(path?: string) {
    if (path) {
      this.trackCliOption({
        flag: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTarget(option?: string) {
    if (option) {
      this.trackCliOption({
        flag: 'target',
        value: option,
      });
    }
  }

  trackCliFlagProd(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
