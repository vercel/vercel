import { TelemetryClient } from '../..';

export class TeamsTelemetryClient extends TelemetryClient {
  trackCliSubcommandInvite(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'invite',
      value: actual,
    });
  }
}
