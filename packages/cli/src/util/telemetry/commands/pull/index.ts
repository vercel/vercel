import { TelemetryClient } from '../..';

export class PullTelemetryClient extends TelemetryClient {
  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      const standardEnvironments = ['production', 'preview', 'development'];
      this.trackCliOption({
        option: 'environment',
        value: standardEnvironments.includes(environment)
          ? environment
          : this.redactedValue,
      });
    }
  }

  trackCliOptionGitBranch(gitBranch: string | undefined) {
    if (gitBranch) {
      this.trackCliOption({
        option: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagProd(isProduction: boolean | undefined) {
    if (isProduction) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
