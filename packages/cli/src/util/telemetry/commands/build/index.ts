import { TelemetryClient } from '../..';

export class BuildTelemetryClient extends TelemetryClient {
  trackCliOptionOutput(path: string | undefined) {
    if (path) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTarget(option: string | undefined) {
    if (option) {
      this.trackCliOption({
        option: 'target',
        value: option,
      });
    }
  }

  trackCliFlagProd(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
