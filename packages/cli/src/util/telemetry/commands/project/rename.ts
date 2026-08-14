import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { renameSubcommand } from '../../../../commands/project/command';

export class ProjectRenameTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof renameSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentNewName(newName: string | undefined) {
    if (newName) {
      this.trackCliArgument({
        arg: 'new-name',
        value: this.redactedValue,
      });
    }
  }
}
