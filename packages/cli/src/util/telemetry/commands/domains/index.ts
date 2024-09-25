import { TelemetryClient } from '../..';

export class DomainsTelemetryClient extends TelemetryClient {
  trackCliSubcommandTransferIn(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'transfer-in',
      value: actual,
    });
  }
}
