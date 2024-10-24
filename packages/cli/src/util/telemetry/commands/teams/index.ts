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

  trackCliSubcommandSwitch(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'switch',
      value: actual ? this.redactedValue : this.noValueToTriggerPrompt,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
