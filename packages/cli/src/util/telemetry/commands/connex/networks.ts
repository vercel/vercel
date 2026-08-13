import { TelemetryClient } from '../..';

export class ConnexNetworksTelemetryClient extends TelemetryClient {
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliArgumentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSearch(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'search',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'format',
        value: v,
      });
    }
  }
}
