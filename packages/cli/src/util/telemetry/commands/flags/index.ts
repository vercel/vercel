import { TelemetryClient } from '../..';
import type { flagsCommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

export class FlagsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof flagsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandOpen(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'open',
      value: actual,
    });
  }

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'set',
      value: actual,
    });
  }

  trackCliSubcommandRollout(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rollout',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }

  trackCliSubcommandArchive(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'archive',
      value: actual,
    });
  }

  trackCliSubcommandDisable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'disable',
      value: actual,
    });
  }

  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'enable',
      value: actual,
    });
  }

  trackCliSubcommandSdkKeys(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'sdk-keys',
      value: actual,
    });
  }

  trackCliSubcommandPrepare(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'prepare',
      value: actual,
    });
  }

  trackCliSubcommandOverride(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'override',
      value: actual,
    });
  }
}
