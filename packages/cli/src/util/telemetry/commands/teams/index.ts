import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { teamsCommand } from '../../../../commands/teams/command';

export class TeamsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof teamsCommand>
{
  trackCliSubcommandInvite(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'invite',
        value: actual,
      });
    }
  }

  trackCliSubcommandAdd(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'add',
        value: actual,
      });
    }
  }

  trackCliSubcommandSwitch(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'switch',
        value: actual,
      });
    }
  }

  trackCliSubcommandList(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'list',
        value: actual,
      });
    }
  }
}
