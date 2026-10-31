import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/ci/command';

export class CiLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
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

  trackCliOptionCommit(commit: string | undefined) {
    if (commit) {
      this.trackCliOption({ option: 'commit', value: this.redactedValue });
    }
  }

  trackCliOptionStatus(status: string | undefined) {
    if (status) {
      this.trackCliOption({ option: 'status', value: status });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
