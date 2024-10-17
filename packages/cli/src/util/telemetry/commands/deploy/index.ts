import { TelemetryClient } from '../..';

export class DeployTelemetryClient extends TelemetryClient {
  trackCliArgumentProjectPath(projectPaths?: string[]) {
    if (projectPaths && projectPaths.length > 0) {
      this.trackCliArgument({
        arg: 'project-path',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionArchive(format?: string) {
    if (format) {
      this.trackCliOption({
        option: 'archive',
        value: format,
      });
    }
  }
  trackCliOptionBuildEnv(buildEnv?: string[]) {
    if (buildEnv && buildEnv.length > 0) {
      this.trackCliOption({
        option: 'build-env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionEnv(env?: string[]) {
    if (env && env.length > 0) {
      this.trackCliOption({
        option: 'env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionMeta(meta?: string[]) {
    if (meta && meta.length > 0) {
      this.trackCliOption({
        option: 'meta',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionName(name?: string) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionRegions(regions?: string) {
    if (regions) {
      this.trackCliOption({
        option: 'regions',
        value: regions,
      });
    }
  }
  trackCliOptionTarget(target?: string) {
    if (target) {
      const value = ['production', 'preview'].includes(target)
        ? target
        : 'CUSTOM_ID_OR_SLUG';
      this.trackCliOption({
        option: 'target',
        value,
      });
    }
  }
  trackCliFlagConfirm(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }
  trackCliFlagForce(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('force');
    }
  }
  trackCliFlagLogs(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('logs');
    }
  }
  trackCliFlagNoClipboard(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('no-clipboard');
    }
  }
  trackCliFlagNoWait(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('no-wait');
    }
  }
  trackCliFlagPrebuilt(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('prebuilt');
    }
  }
  trackCliFlagProd(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('prod');
    }
  }
  trackCliFlagPublic(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('public');
    }
  }
  trackCliFlagSkipDomain(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('skip-domain');
    }
  }
  trackCliFlagWithCache(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('with-cache');
    }
  }
  trackCliFlagYes(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('yes');
    }
  }
}
