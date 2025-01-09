import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pullSubcommand } from '../../../../commands/env/command';

export class EnvPullTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pullSubcommand>
{
  trackCliArgumentFilename(filename: string | undefined) {
    if (filename) {
      this.trackCliArgument({
        arg: 'filename',
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

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
