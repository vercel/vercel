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

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
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

  trackCliArgumentMember(member: string | undefined) {
    if (member) {
      this.trackCliArgument({
        arg: 'member',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
