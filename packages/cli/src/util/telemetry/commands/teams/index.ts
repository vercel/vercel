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

  trackCliSubcommandCreate(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'create',
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

  trackCliSubcommandRequest(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'request',
        value: actual,
      });
    }
  }

  trackCliSubcommandSso(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'sso',
        value: actual,
      });
    }
  }

  trackCliSubcommandMembers(actual?: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'members',
        value: actual,
      });
    }
  }
}
