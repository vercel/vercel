import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inviteSubcommand } from '../../../../commands/teams/command';
import type { TeamMemberRole } from '../../../../teams/team-member-roles';

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

  trackCliOptionRole(value: TeamMemberRole | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'role',
        value,
      });
    }
  }
}
