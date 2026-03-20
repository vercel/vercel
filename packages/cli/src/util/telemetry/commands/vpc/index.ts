import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { vpcCommand } from '../../../../commands/vpc/command';

export class VpcTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof vpcCommand>
{
  trackCliSubcommandInit(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'init',
      value: actual,
    });
  }

  trackCliSubcommandConnect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'connect',
      value: actual,
    });
  }
}
