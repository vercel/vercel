import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { projectsSubcommand } from '../../../../commands/access-group/command';

export class AccessGroupProjectsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof projectsSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliArgumentGroup(group: string | undefined) {
    if (group) {
      this.trackCliArgument({
        arg: 'group',
        value: this.redactedValue,
      });
    }
  }
}
