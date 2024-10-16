import { TelemetryClient } from '../..';

export class AliasTelemetryClient extends TelemetryClient {
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'set',
      value: actual,
    });
  }
}
