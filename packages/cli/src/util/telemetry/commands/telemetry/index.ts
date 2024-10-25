import { TelemetryClient } from '../..';

export class TelemetryTelemetryClient extends TelemetryClient {
  trackCliSubcommandStatus(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: actual,
    });
  }

  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'enable',
      value: actual,
    });
  }
}
