import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeSubcommand } from '../../../../commands/target/command';

export class TargetRemoveTelemetryClient
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

  trackCliFlagDeleteUnassignedEnvVars(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('delete-unassigned-env-vars');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
