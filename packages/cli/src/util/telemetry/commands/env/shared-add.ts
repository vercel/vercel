import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedAddSubcommand } from '../../../../commands/env/command';

const KNOWN_TARGETS = ['production', 'preview', 'development'];

export class EnvSharedAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedAddSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({ arg: 'name', value: this.redactedValue });
    }
  }

  trackCliArgumentValue(value: string | undefined) {
    if (value) {
      this.trackCliArgument({ arg: 'value', value: this.redactedValue });
    }
  }

  trackCliOptionEnvironment(environments: [string] | undefined) {
    if (environments && environments.length) {
      for (const environment of environments) {
        this.trackCliOption({
          option: 'environment',
          value: KNOWN_TARGETS.includes(environment)
            ? environment
            : this.redactedValue,
        });
      }
    }
  }

  trackCliOptionProject(projects: [string] | undefined) {
    if (projects && projects.length) {
      for (const _project of projects) {
        this.trackCliOption({ option: 'project', value: this.redactedValue });
      }
    }
  }

  trackCliFlagSensitive(sensitive: boolean | undefined) {
    if (sensitive) {
      this.trackCliFlag('sensitive');
    }
  }

  trackCliOptionComment(comment: string | undefined) {
    if (comment) {
      this.trackCliOption({ option: 'comment', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
