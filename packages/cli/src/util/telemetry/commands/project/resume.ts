import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { resumeSubcommand } from '../../../../commands/project/command';

export class ProjectResumeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof resumeSubcommand>
{
  trackCliArgumentProject(value: string[]) {
    if (value.length > 0) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(all: boolean | undefined) {
    if (all) {
      this.trackCliFlag('all');
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
