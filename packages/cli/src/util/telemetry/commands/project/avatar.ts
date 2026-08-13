import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { avatarSubcommand } from '../../../../commands/project/command';

export class ProjectAvatarTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof avatarSubcommand>
{
  trackCliArgumentAction(action: string | undefined) {
    if (action) {
      this.trackCliArgument({
        arg: 'action',
        value: action,
      });
    }
  }

  trackCliArgumentProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentFile(file: string | undefined) {
    if (file) {
      this.trackCliArgument({
        arg: 'file',
        value: this.redactedValue,
      });
    }
  }
}
