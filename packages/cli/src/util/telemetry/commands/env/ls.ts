import { TelemetryClient } from '../..';

export class EnvLsTelemetryClient extends TelemetryClient {
  trackCliArgumentEnvironment(environment?: string) {
    if (environment) {
      const standardEnvironments = ['production', 'preview', 'development'];
      this.trackCliArgument({
        arg: 'environment',
        value: standardEnvironments.includes(environment)
          ? environment
          : this.redactedValue,
      });
    }
  }

  trackCliArgumentGitBranch(gitBranch?: string) {
    if (gitBranch) {
      this.trackCliArgument({
        arg: 'git-branch',
        value: this.redactedValue,
      });
    }
  }
}
