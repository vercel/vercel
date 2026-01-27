import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { flagsCommand } from '../../../../commands/flags/command';

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

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
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
}
