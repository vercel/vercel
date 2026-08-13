import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { targetCommand } from '../../../../commands/target/command';

export class TargetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof targetCommand>
{
  trackCliSubcommandList(subcommandActual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: subcommandActual,
    });
  }

  trackCliSubcommandInspect(subcommandActual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: subcommandActual,
    });
  }
}
