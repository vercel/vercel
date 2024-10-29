import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pullCommand } from '../../../../commands/pull/command';

export class PullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullCommand>
{
  trackCliArgumentProjectPath: (v: string | undefined) => void;

  trackCliOptionEnvironment(environment?: string) {
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

  trackCliOptionGitBranch(gitBranch?: string) {
    if (gitBranch) {
      this.trackCliOption({
        option: 'git-branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagProd(isProduction?: boolean) {
    if (isProduction) {
      this.trackCliFlag('prod');
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
