import { TelemetryClient } from '../..';

export class GitTelemetryClient extends TelemetryClient {
  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }

  trackCliSubcommandDisconnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disconnect',
      value: actual,
    });
  }

  trackCliFlagConfirm(confirm: boolean | undefined) {
    if (confirm) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
