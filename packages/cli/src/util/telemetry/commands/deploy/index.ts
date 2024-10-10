import { TelemetryClient } from '../..';

export class DeployTelemetryClient extends TelemetryClient {
  trackCliArgumentProjectPath(projectPaths: string[]) {
    if (projectPaths.length > 0) {
      this.trackCliArgument({
        arg: 'project-path',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionArchive(format: string | boolean) {
    this.trackCliOption({
      flag: 'archive',
      value: typeof format === 'string' ? format : String(format),
    });
  }
  trackCliOptionBuildEnv(buildEnv?: string[]) {
    if (buildEnv && buildEnv.length > 0) {
      this.trackCliOption({
        flag: 'build-env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionEnv(env?: string[]) {
    if (env && env.length > 0) {
      this.trackCliOption({
        flag: 'env',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionMeta(meta?: string[]) {
    if (meta && meta.length > 0) {
      this.trackCliOption({
        flag: 'meta',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionName(name?: string) {
    if (name) {
      this.trackCliOption({
        flag: 'name',
        value: this.redactedValue,
      });
    }
  }
  trackCliOptionRegions(regions?: string[]) {
    if (regions && regions.length > 0) {
      this.trackCliOption({
        flag: 'regions',
        value: regions.join(','),
      });
    }
  }
  trackCliFlagConfirm() {
    this.trackCliFlag('confirm');
  }
  trackCliFlagForce() {
    this.trackCliFlag('force');
  }
  trackCliFlagLogs() {
    this.trackCliFlag('logs');
  }
  trackCliFlagNoClipboard() {
    this.trackCliFlag('no-clipboard');
  }
  trackCliFlagNoWait() {
    this.trackCliFlag('no-wait');
  }
  trackCliFlagPrebuilt() {
    this.trackCliFlag('prebuilt');
  }
  trackCliFlagProd() {
    this.trackCliFlag('prod');
  }
  trackCliFlagPublic() {
    this.trackCliFlag('public');
  }
  trackCliFlagSkipDomain() {
    this.trackCliFlag('skip-domain');
  }
  trackCliFlagTarget(target?: string) {
    if (target) {
      const value = ['production', 'preview'].includes(target)
        ? target
        : 'customIdOrSlug';
      this.trackCliOption({
        flag: 'target',
        value,
      });
    }
  }
  trackCliFlagWithCache() {
    this.trackCliFlag('with-cache');
  }
  trackCliFlagYes() {
    this.trackCliFlag('yes');
  }
}
