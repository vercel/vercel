import { TelemetryClient } from '../..';

export class TargetTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(subcommandActual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: subcommandActual,
    });
  }
}
