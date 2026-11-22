import { TelemetryClient } from '../..';

export class WhoamiTelemetryClient extends TelemetryClient {
  trackCliFlagCached(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('cached');
    }
  }
}
