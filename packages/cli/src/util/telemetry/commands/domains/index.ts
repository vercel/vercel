import { TelemetryClient } from '../..';

export class DomainsTelemetryClient extends TelemetryClient {
  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandMove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'move',
      value: actual,
    });
  }

  trackCliSubcommandBuy(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'buy',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandTransferIn(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'transfer-in',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliFlagHelp(command: string, subcommand?: string | string[]) {
    let passedSubcommand: string | string[] | undefined;
    if (subcommand === 'transferIn') {
      passedSubcommand = 'transfer-in';
    } else {
      passedSubcommand = subcommand;
    }

    super.trackCliFlagHelp(command, passedSubcommand);
  }
}
