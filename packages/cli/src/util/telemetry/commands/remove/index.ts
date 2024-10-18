import { TelemetryClient } from '../..';

export class RemoveTelemetryClient extends TelemetryClient {
  trackCliFlagHard(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('hard');
    }
  }

  trackCliFlagSafe(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('safe');
    }
  }

  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
