import { TelemetryClient } from '../..';

export class UpgradeTelemetryClient extends TelemetryClient {
  trackCliArgumentVersion(value: 'latest' | 'version' | 'invalid' | undefined) {
    if (value) {
      this.trackCliArgument({ arg: 'version', value });
    }
  }

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

  trackCliFlagAutoupdate(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('autoupdate');
    }
  }

  trackCliFlagNoAutoupdate(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-autoupdate');
    }
  }

  /** The old name of `--autoupdate`. */
  trackCliFlagEnableAuto(enableAuto: boolean | undefined) {
    if (enableAuto) {
      this.trackCliFlag('enable-auto');
    }
  }

  /** The old name of `--no-autoupdate`. */
  trackCliFlagDisableAuto(disableAuto: boolean | undefined) {
    if (disableAuto) {
      this.trackCliFlag('disable-auto');
    }
  }

  trackCliFlagBypassMinReleaseAge(bypass: boolean | undefined) {
    if (bypass) {
      this.trackCliFlag('bypass-min-release-age');
    }
  }

  trackCliFlagNoBypassMinReleaseAge(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-bypass-min-release-age');
    }
  }

  /** The old name of `--no-bypass-min-release-age`. */
  trackCliFlagDisableMinReleaseAgeBypass(disable: boolean | undefined) {
    if (disable) {
      this.trackCliFlag('disable-min-release-age-bypass');
    }
  }
}
