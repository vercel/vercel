import type { removeSubcommand } from '../../../../commands/project/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class ProjectRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }
}
