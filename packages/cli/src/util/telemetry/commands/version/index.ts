import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { versionCommand } from '../../../../commands/version/command';

export interface NativeUpdateTelemetry {
  outcome: 'success' | 'failure' | 'timeout';
  source: 'discovery' | 'cached';
  totalMs: number;
  discoveryMs?: number;
  stagingMs?: number;
}

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

  trackCliSubcommandCheck(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'check',
      value: actual,
    });
  }

  trackCliSubcommandAutoupdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'autoupdate',
      value: actual,
    });
  }

  trackNativeUpdate(event: NativeUpdateTelemetry) {
    this.trackCommandOutput({
      key: 'native-update',
      value: JSON.stringify(event),
    });
  }
}
