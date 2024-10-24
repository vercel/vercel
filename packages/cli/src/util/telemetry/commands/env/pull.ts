import { TelemetryClient } from '../..';

export class EnvPullTelemetryClient extends TelemetryClient {
  trackCliArgumentFilename(filename?: string) {
    if (filename) {
      this.trackCliArgument({
        arg: 'filename',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment?: string) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGitBranch(gitBranch?: string) {
    if (gitBranch) {
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
}
