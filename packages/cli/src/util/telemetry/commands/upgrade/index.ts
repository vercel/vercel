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

  trackCliFlagExperimental(experimental: boolean | undefined) {
    if (experimental) {
      this.trackCliFlag('experimental');
    }
  }

  trackCliFlagStable(stable: boolean | undefined) {
    if (stable) {
      this.trackCliFlag('stable');
    }
  }

  trackCliFlagBinary(binary: boolean | undefined) {
    if (binary) {
      this.trackCliFlag('binary');
    }
  }

  trackCliFlagNoBinary(noBinary: boolean | undefined) {
    if (noBinary) {
      this.trackCliFlag('no-binary');
    }
  }
}
