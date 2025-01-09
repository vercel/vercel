import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { domainsCommand } from '../../../../commands/domains/command';

export class DomainsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof domainsCommand>
{
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
}
