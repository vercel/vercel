import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { telemetryCommand } from '../../../../commands/telemetry/command';

export class TelemetryTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof telemetryCommand>
{
  trackCliSubcommandStatus(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: actual,
    });
  }

  trackCliSubcommandEnable(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'enable',
      value: actual,
    });
  }

  trackCliSubcommandDisable(_: string) {
    // NOTE: this function is intentionally not implemented
    // because the user has explicitly opted out of telemetry
  }

  trackCliSubcommandFlush(_: string) {
    // NOTE: this function is intentionally not implemented
    // because it is intended for internal use only and doesn't need to be tracked
  }
}
