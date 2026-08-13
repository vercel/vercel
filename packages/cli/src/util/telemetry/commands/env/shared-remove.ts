import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedRemoveSubcommand } from '../../../../commands/env/command';

export class EnvSharedRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedRemoveSubcommand>
{
  trackCliArgumentNameOrId(nameOrId: string | undefined) {
    if (nameOrId) {
      this.trackCliArgument({ arg: 'name-or-id', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
