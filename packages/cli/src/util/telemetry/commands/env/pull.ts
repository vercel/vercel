import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { TelemetryMethods } from '../../types';
import type { pullSubcommand } from '../../../../commands/env/command';
import type { CustomEnvironmentType } from '@vercel-internals/types';

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
      this.trackCliOption({
        option: 'environment',
        value: STANDARD_ENVIRONMENTS.includes(
          environment as CustomEnvironmentType
        )
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
