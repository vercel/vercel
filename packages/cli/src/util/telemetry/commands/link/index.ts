import { TelemetryClient } from '../..';

export class LinkTelemetryClient extends TelemetryClient {
  trackCliFlagRepo(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('repo');
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliOptionProject(project?: string) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }
}
