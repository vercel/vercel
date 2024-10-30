import { TelemetryClient } from '../..';

export class IntegrationResourceTelemetryClient extends TelemetryClient {
  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandDisconnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disconnect',
      value: actual,
    });
  }
}
