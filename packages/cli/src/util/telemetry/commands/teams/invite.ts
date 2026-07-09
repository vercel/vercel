import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import { isTeamRole } from '../../../teams/invite-user-to-team';
import type { inviteSubcommand } from '../../../../commands/teams/command';

export class TeamsInviteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inviteSubcommand>
{
  trackCliArgumentEmail(values: string[]) {
    if (values) {
      this.trackCliArgument({
        arg: 'email',
        value: this.redactedArgumentsLength(values),
      });
    }
  }

  trackCliOptionRole(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'role',
        value: isTeamRole(value) ? value : this.redactedValue,
      });
    }
  }
}
