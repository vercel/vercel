import { TelemetryClient } from '../..';

export class CertsTelemetryClient extends TelemetryClient {
  trackCliSubcommandIssue(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'issue',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }
}
