import { TelemetryClient } from '../..';

export class TeamsTelemetryClient extends TelemetryClient {
  trackCliSubcommandInvite(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'invite',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }
}
