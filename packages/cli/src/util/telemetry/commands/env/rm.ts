import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { TelemetryMethods } from '../../types';
import type { removeSubcommand } from '../../../../commands/env/command';
import type { CustomEnvironmentType } from '@vercel-internals/types';

export class EnvRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliArgument({
        arg: 'environment',
        value: STANDARD_ENVIRONMENTS.includes(
          environment as CustomEnvironmentType
        )
          ? environment
          : this.redactedValue,
      });
    }
  }

  trackCliArgumentGitBranch(gitBranch: string | undefined) {
    if (gitBranch) {
      this.trackCliArgument({
        arg: 'git-branch',
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
