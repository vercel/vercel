import type {
  disableSubcommand,
  enableSubcommand,
  invokeSubcommand,
} from '../../../../commands/schedules/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class SchedulesActionTelemetryClient
  extends TelemetryClient
  implements
    TelemetryMethods<typeof enableSubcommand>,
    TelemetryMethods<typeof disableSubcommand>,
    TelemetryMethods<typeof invokeSubcommand>
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

  trackCliOptionUntil(until: string | undefined) {
    if (until) {
      this.trackCliOption({ option: 'until', value: this.redactedValue });
    }
  }

  trackCliOptionFor(duration: string | undefined) {
    if (duration) {
      this.trackCliOption({ option: 'for', value: this.redactedValue });
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
