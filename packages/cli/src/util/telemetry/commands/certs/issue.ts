import { CertsAddTelemetryClient } from './add';

export class CertsIssueTelemetryClient extends CertsAddTelemetryClient {
  trackCliFlagChallengeOnly(v?: boolean) {
    if (v) {
      this.trackCliFlag('challenge-only');
    }
  }
}
