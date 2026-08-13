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

  trackCliSubcommandCheck(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'check',
      value: actual,
    });
  }

  trackCliSubcommandPrice(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'price',
      value: actual,
    });
  }

  trackCliSubcommandSearch(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'search',
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

  trackCliSubcommandRenew(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'renew',
      value: actual,
    });
  }

  trackCliSubcommandAutoRenew(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'auto-renew',
      value: actual,
    });
  }

  trackCliSubcommandNameservers(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'nameservers',
      value: actual,
    });
  }

  trackCliSubcommandAuthCode(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'auth-code',
      value: actual,
    });
  }

  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandVerify(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'verify',
      value: actual,
    });
  }
}
