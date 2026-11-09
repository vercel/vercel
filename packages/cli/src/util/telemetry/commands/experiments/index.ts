import { TelemetryClient } from '../..';

export class ExperimentsTelemetryClient extends TelemetryClient {
  trackSubcommand(subcommand: string, actual: string): void {
    this.trackCliSubcommand({ subcommand, value: actual });
  }
}
