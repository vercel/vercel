import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { skillsSubcommand } from '../../../../commands/setup/command';

export class SetupSkillsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof skillsSubcommand>
{
  trackCliOptionOutput(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'output', value: this.redactedValue });
    }
  }

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({ option: 'format', value: v });
    }
  }
}
