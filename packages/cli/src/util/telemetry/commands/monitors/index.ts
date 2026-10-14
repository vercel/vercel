import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { monitorsCommand } from '../../../../commands/monitors/command';

export class MonitorsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof monitorsCommand>
{
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandSchema(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'schema',
      value: actual,
    });
  }

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

  trackCliSubcommandRm(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }
}
