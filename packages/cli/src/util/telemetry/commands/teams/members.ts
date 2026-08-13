import { TelemetryClient } from '../..';

export class TeamsMembersTelemetryClient extends TelemetryClient {
  trackCliSubcommandUpdate(actual: string) {
    if (actual) {
      this.trackCliSubcommand({
        subcommand: 'update',
        value: actual,
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

  trackCliOptionRole(role: string | undefined) {
    if (role) {
      // `role` is a fixed enum value validated against `teamRoles`, so it is
      // safe (and useful) to record verbatim.
      this.trackCliOption({
        option: 'role',
        value: role,
      });
    }
  }
}
