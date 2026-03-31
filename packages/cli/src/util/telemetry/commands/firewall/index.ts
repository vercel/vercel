import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { firewallCommand } from '../../../../commands/firewall/command';

export class FirewallTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof firewallCommand>
{
  trackCliSubcommandOverview(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'overview',
      value: actual,
    });
  }

  trackCliSubcommandDiff(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'diff',
      value: actual,
    });
  }

  trackCliSubcommandPublish(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'publish',
      value: actual,
    });
  }

  trackCliSubcommandDiscard(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'discard',
      value: actual,
    });
  }

  trackCliSubcommandSystemBypass(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-bypass',
      value: actual,
    });
  }

  trackCliSubcommandSystemBypassList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-bypass:list',
      value: actual,
    });
  }

  trackCliSubcommandSystemBypassAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-bypass:add',
      value: actual,
    });
  }

  trackCliSubcommandSystemBypassRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-bypass:remove',
      value: actual,
    });
  }
}
