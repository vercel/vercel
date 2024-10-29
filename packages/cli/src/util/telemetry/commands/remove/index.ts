import { TelemetryClient } from '../..';

export class RemoveTelemetryClient extends TelemetryClient {
  trackCliFlagHard(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('hard');
    }
  }

  trackCliFlagSafe(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('safe');
    }
  }

  trackCliFlagYes(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
