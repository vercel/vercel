import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedUnlinkSubcommand } from '../../../../commands/env/command';

export class EnvSharedUnlinkTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedUnlinkSubcommand>
{
  trackCliArgumentNameOrId(nameOrId: string | undefined) {
    if (nameOrId) {
      this.trackCliArgument({ arg: 'name-or-id', value: this.redactedValue });
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({ option: 'project', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
