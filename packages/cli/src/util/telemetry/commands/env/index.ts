import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { envCommand } from '../../../../commands/env/command';

export class EnvTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof envCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
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
  trackCliSubcommandPull(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pull',
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
