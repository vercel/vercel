import { TelemetryClient } from '../..';

export class UpgradeTelemetryClient extends TelemetryClient {
  trackCliFlagDryRun(dryRun: boolean | undefined) {
    if (dryRun) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
