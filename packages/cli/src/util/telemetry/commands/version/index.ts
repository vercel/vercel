import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { versionCommand } from '../../../../commands/version/command';

export class VersionTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof versionCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandInstalled(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'installed',
      value: actual,
    });
  }

  trackCliSubcommandUse(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'use',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandAutoupdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'autoupdate',
      value: actual,
    });
  }
}
