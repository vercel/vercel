import { TelemetryClient } from '../..';

export class EnvTelemetryClient extends TelemetryClient {
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRm(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }
  trackCliSubcommandPull(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pull',
      value: actual,
    });
  }
}
