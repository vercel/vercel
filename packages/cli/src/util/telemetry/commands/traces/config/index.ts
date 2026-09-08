import { TelemetryClient } from '../../../';
import type { TelemetryMethods } from '../../../types';
import type { tracesConfigCommand } from '../../../../../commands/traces/config/command';

export class TracesConfigTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tracesConfigCommand>
{
  trackCliSubcommandLs(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'ls',
      value: actual,
    });
  }

  trackCliSubcommandSet(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'set',
      value: actual,
    });
  }

  trackCliSubcommandRm(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rm',
      value: actual,
    });
  }
}
