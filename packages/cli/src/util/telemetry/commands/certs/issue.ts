import { CertsAddTelemetryClient } from './add';

export class CertsIssueTelemetryClient extends CertsAddTelemetryClient {
  trackCliFlagChallengeOnly(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('challenge-only');
    }
  }
}
