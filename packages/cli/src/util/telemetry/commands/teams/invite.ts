import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inviteSubcommand } from '../../../../commands/teams/command';

export class TeamsInviteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inviteSubcommand>
{
  trackCliArgumentEmails(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'email',
        value,
      });
    }
  }
}
