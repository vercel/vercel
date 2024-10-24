import { TelemetryClient } from '../..';

export class PullTelemetryClient extends TelemetryClient {
  trackCliOptionGitBranch(branch?: string) {
    if (branch) {
      this.trackCliOption({
        option: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentFilename(filename?: string) {
    if (filename) {
      this.trackCliArgument({
        arg: 'filename',
        value: this.redactedValue,
      });
    }
  }
}
