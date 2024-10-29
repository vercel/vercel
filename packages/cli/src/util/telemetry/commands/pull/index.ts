import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pullCommand } from '../../../../commands/pull/command';

export class PullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullCommand>
{
  trackCliArgumentProjectPath(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'projectPath',
        value: this.redactedValue,
      });
    }
  }

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
