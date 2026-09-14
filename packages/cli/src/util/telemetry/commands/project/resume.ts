import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { resumeSubcommand } from '../../../../commands/project/command';

export class ProjectResumeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof resumeSubcommand>
{
  trackCliArgumentProject(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
