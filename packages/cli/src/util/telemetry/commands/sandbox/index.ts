import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sandboxCommand } from '../../../../commands/sandbox/command';

export class SandboxTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sandboxCommand>
{
  trackCliSubcommandExec(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'exec',
      value: actual,
    });
  }

  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'create',
      value: actual,
    });
  }
}
