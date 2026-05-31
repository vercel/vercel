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

  trackCliFlagEnableAuto(enableAuto: boolean | undefined) {
    if (enableAuto) {
      this.trackCliFlag('enable-auto');
    }
  }

  trackCliFlagDisableAuto(disableAuto: boolean | undefined) {
    if (disableAuto) {
      this.trackCliFlag('disable-auto');
    }
  }
}
