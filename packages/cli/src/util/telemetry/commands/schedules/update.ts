import type { updateSubcommand } from '../../../../commands/schedules/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class SchedulesUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
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

  trackCliOptionCron(cron: string | undefined) {
    if (cron) {
      this.trackCliOption({ option: 'cron', value: this.redactedValue });
    }
  }

  trackCliOptionAt(at: string | undefined) {
    if (at) {
      this.trackCliOption({ option: 'at', value: this.redactedValue });
    }
  }

  trackCliOptionTimezone(timezone: string | undefined) {
    if (timezone) {
      this.trackCliOption({ option: 'timezone', value: timezone });
    }
  }

  trackCliOptionJitter(jitter: string | undefined) {
    if (jitter !== undefined) {
      this.trackCliOption({ option: 'jitter', value: jitter });
    }
  }

  trackCliOptionTopic(topic: string | undefined) {
    if (topic) {
      this.trackCliOption({ option: 'topic', value: this.redactedValue });
    }
  }

  trackCliOptionPayload(payload: string | undefined) {
    if (payload !== undefined) {
      this.trackCliOption({ option: 'payload', value: this.redactedValue });
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
