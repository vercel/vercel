import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsSubcommand } from '../../../../commands/ci/command';

export class CiLogsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsSubcommand>
{
  trackCliArgumentRun(run: string | undefined) {
    if (run) {
      this.trackCliArgument({ arg: 'run', value: this.redactedValue });
    }
  }

  trackCliFlagFailed(failed: boolean | undefined) {
    if (failed) {
      this.trackCliFlag('failed');
    }
  }

  trackCliOptionTask(tasks: string[] | undefined) {
    if (tasks?.length) {
      this.trackCliOption({ option: 'task', value: this.redactedValue });
    }
  }

  trackCliOptionLevel(levels: string[] | undefined) {
    if (levels?.length) {
      this.trackCliOption({ option: 'level', value: levels.join(',') });
    }
  }

  trackCliOptionGrep(grep: string | undefined) {
    if (grep !== undefined) {
      this.trackCliOption({ option: 'grep', value: this.redactedValue });
    }
  }

  trackCliOptionAttempt(attempt: number | undefined) {
    if (attempt !== undefined) {
      this.trackCliOption({ option: 'attempt', value: String(attempt) });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliFlagFollow(follow: boolean | undefined) {
    if (follow) {
      this.trackCliFlag('follow');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
