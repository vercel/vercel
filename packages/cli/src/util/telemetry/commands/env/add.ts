import { TelemetryClient } from '../..';

export class EnvAddTelemetryClient extends TelemetryClient {
  trackCliArgumentName(name?: string) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentEnvironment(environment?: string) {
    if (environment) {
      this.trackCliArgument({
        arg: 'environment',
        value: this.redactedValue,
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

  trackCliFlagSensitive(sensitive?: boolean) {
    if (sensitive) {
      this.trackCliFlag('sensitive');
    }
  }

  trackCliFlagForce(force?: boolean) {
    if (force) {
      this.trackCliFlag('force');
    }
  }
}
