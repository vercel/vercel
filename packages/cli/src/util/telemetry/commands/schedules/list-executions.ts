import type { executionsListSubcommand } from '../../../../commands/schedules/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class SchedulesListExecutionsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof executionsListSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({ arg: 'name', value: this.redactedValue });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
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

  trackCliOptionNamespace(namespace: string | undefined) {
    if (namespace) {
      this.trackCliOption({
        option: 'namespace',
        value: this.redactedValue,
      });
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

  trackCliOptionSort(sort: string | undefined) {
    if (sort) {
      this.trackCliOption({ option: 'sort', value: sort });
    }
  }

  trackCliOptionSince(since: string | undefined) {
    if (since) {
      this.trackCliOption({ option: 'since', value: this.redactedValue });
    }
  }

  trackCliOptionUntil(until: string | undefined) {
    if (until) {
      this.trackCliOption({ option: 'until', value: this.redactedValue });
    }
  }

  trackCliOptionFrom(from: number | undefined) {
    if (from !== undefined) {
      this.trackCliOption({ option: 'from', value: String(from) });
    }
  }

  trackCliOptionTo(to: number | undefined) {
    if (to !== undefined) {
      this.trackCliOption({ option: 'to', value: String(to) });
    }
  }

  trackCliOptionExecution(execution: string | undefined) {
    if (execution) {
      this.trackCliOption({
        option: 'execution',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionExecutionId(executionId: string | undefined) {
    if (executionId) {
      this.trackCliOption({
        option: 'execution-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagLocal(local: boolean | undefined) {
    if (local) this.trackCliFlag('local');
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
