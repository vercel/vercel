import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { skillsCommand } from '../../../../commands/skills/command';

export class SkillsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof skillsCommand>
{
  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentQuery(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'query',
        value: this.redactedValue,
      });
    }
  }
}
