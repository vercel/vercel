import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { buyCommand } from '../../../../commands/buy/command';

export class BuyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buyCommand>
{
  trackCliSubcommandCredits(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'credits',
      value: actual,
    });
  }

  trackCliSubcommandAddon(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'addon',
      value: actual,
    });
  }

  trackCliSubcommandPro(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pro',
      value: actual,
    });
  }

  trackCliSubcommandV0(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'v0',
      value: actual,
    });
  }

  trackCliSubcommandDomain(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'domain',
      value: actual,
    });
  }
}
