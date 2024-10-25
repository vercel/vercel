import { TelemetryClient } from '../..';

export class RollbackTelemetryClient extends TelemetryClient {
  trackCliSubcommandStatus() {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: 'status',
    });
  }

  trackCliOptionTimeout(time: string | undefined) {
    if (time) {
      this.trackCliOption({
        option: 'timeout',
        value: '[TIME]',
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
