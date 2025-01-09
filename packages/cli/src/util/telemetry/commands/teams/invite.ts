import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
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
}
