import { TelemetryClient } from '../..';

export class AliasTelemetryClient extends TelemetryClient {
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }
}
