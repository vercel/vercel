import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { membersSubcommand } from '../../../../commands/access-group/command';

export class AccessGroupMembersTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof membersSubcommand>
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
