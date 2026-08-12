import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { pauseSubcommand } from '../../../../commands/project/command';

export class ProjectPauseTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof pauseSubcommand>
{
  trackCliArgumentProject(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
