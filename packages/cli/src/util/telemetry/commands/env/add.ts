import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/env/command';

export class EnvAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
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
    const standardEnvironments = ['production', 'preview', 'development'];
    if (environment) {
      this.trackCliArgument({
        arg: 'environment',
        value: standardEnvironments.includes(environment)
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

  trackCliFlagSensitive(sensitive: boolean | undefined) {
    if (sensitive) {
      this.trackCliFlag('sensitive');
    }
  }

  trackCliFlagForce(force: boolean | undefined) {
    if (force) {
      this.trackCliFlag('force');
    }
  }
}
