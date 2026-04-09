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

  trackCliSubcommandIpBlocks(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ip-blocks',
      value: actual,
    });
  }

  trackCliSubcommandIpBlocksList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ip-blocks:list',
      value: actual,
    });
  }

  trackCliSubcommandIpBlocksBlock(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ip-blocks:block',
      value: actual,
    });
  }

  trackCliSubcommandIpBlocksUnblock(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ip-blocks:unblock',
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

  trackCliSubcommandAttackMode(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'attack-mode',
      value: actual,
    });
  }

  trackCliSubcommandAttackModeEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'attack-mode:enable',
      value: actual,
    });
  }

  trackCliSubcommandAttackModeDisable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'attack-mode:disable',
      value: actual,
    });
  }

  trackCliSubcommandSystemMitigations(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-mitigations',
      value: actual,
    });
  }

  trackCliSubcommandSystemMitigationsPause(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-mitigations:pause',
      value: actual,
    });
  }

  trackCliSubcommandSystemMitigationsResume(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'system-mitigations:resume',
      value: actual,
    });
  }
}
