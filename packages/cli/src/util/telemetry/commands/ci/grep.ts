import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { grepSubcommand } from '../../../../commands/ci/command';

export class CiGrepTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof grepSubcommand>
{
  trackCliArgumentText(text: string | undefined) {
    if (text) {
      this.trackCliArgument({ arg: 'text', value: this.redactedValue });
    }
  }

  trackCliOptionGitBranch(gitBranch: string | undefined) {
    if (gitBranch) {
      this.trackCliOption({ option: 'git-branch', value: this.redactedValue });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionBranch(branch: string | undefined) {
    if (branch) {
      this.trackCliOption({ option: 'branch', value: this.redactedValue });
    }
  }

  trackCliFlagAllBranches(allBranches: boolean | undefined) {
    if (allBranches) {
      this.trackCliFlag('all-branches');
    }
  }

  trackCliOptionStatus(status: string | undefined) {
    if (status) {
      this.trackCliOption({ option: 'status', value: status });
    }
  }

  trackCliOptionRuns(runs: number | undefined) {
    if (runs !== undefined) {
      this.trackCliOption({ option: 'runs', value: String(runs) });
    }
  }

  trackCliOptionLevel(levels: string[] | undefined) {
    if (levels?.length) {
      this.trackCliOption({ option: 'level', value: levels.join(',') });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
