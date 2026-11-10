import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createSubcommand } from '../../../../commands/deploy-hooks/command';

export class DeployHooksCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
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

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionRef(ref: string | undefined) {
    if (ref) {
      this.trackCliOption({
        option: 'ref',
        value: this.redactedValue,
      });
    }
  }
}
